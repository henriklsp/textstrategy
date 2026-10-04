import { Event } from './Event';
import { Section } from './Section';
import { PersonSelection } from './PersonSelection';
import { Effect } from './Effect';
import { Choice } from './Choice';
import { VariablePrerequisite } from './VariablePrerequisite';
import { CanDoTaskPrerequisite } from './CanDoTaskPrerequisite';
import { Prerequisite } from './Prerequisite';
import { EventLoader } from './EventLoader';
import { EffectFactory, ParseIssue } from './EffectFactory';

// Re-export ParseIssue for backward compatibility
export type { ParseIssue };

// Data collected for one section before the Section objects are built
interface SectionData {
    line: number;
    // Text lines as written (trimmed); blank lines between text lines are kept as ''
    textLines: string[];
    sectionNumber: number | null;
    effects: Effect[];
    personSelections: PersonSelection[];
    choiceConfigs: { line: number; targetSectionNumber: number; choiceText: string; prerequisite: Prerequisite | null }[];
}

// Parses structured text files into Event objects.
// Syntax:
//   // comment → Line is ignored
//   *A: magic → PersonSelection (role A requires positive magic trait)
//   *B: -magic → PersonSelection (role B requires negative magic trait)
//   §1 text → Section
//   [var variablename value] → VarEffect to adjust named variable by value
//   [bool variablename boolvalue] → BoolEffect to set named variable to true/false
//   [event eventname delay] → EventEffect to trigger named event after x days delay
//   [task rolename tasktype] → AssignTaskEffect to assign role to a task
//   [build buildingtype days] → StartConstructionEffect to start building construction
//   #2 text → Choice: display a user dialog option to go to Section number x
//   #n pointing to a section that does not exist ends the dialog.
//   Text lines are kept as written (joined with '\n', blank lines included);
//   how they are laid out is up to the UI.
//
// Problems (unknown effects, missing sections, ...) are collected as ParseIssues,
// logged as warnings, and available from getIssues() after parsing.
export class EventParser {
    private readonly loader: EventLoader;
    private issues: ParseIssue[] = [];

    constructor() {
        this.loader = new EventLoader();
    }

    public isBrowserEnvironment(): boolean {
        return this.loader.isBrowserEnvironment();
    }

    // Issues found by the most recent parse
    public getIssues(): ParseIssue[] {
        return [...this.issues];
    }

    // Path of a named event file, e.g. "intro" -> text/intro.txt
    public eventPath(eventName: string): string {
        return this.loader.eventPath(eventName);
    }

    // Load and parse a named event file (works in both browser and Node)
    public async loadEvent(eventName: string): Promise<Event> {
        const content = await this.loader.loadEvent(eventName);
        if (content === null) {
            return new Event();
        }
        return this.parseText(content, eventName);
    }

    // Load and parse a file: fetch in the browser, file system in Node.
    // Returns an empty Event if the file cannot be read.
    public async parseFile(filePath: string): Promise<Event> {
        const content = await this.loader.load(filePath);
        if (content === null) {
            return new Event();
        }
        return this.parseText(content, filePath);
    }

    // Node only: synchronous file read. Returns an empty Event in the browser or on error.
    public parseFileSync(filePath: string): Event {
        const content = this.loader.loadSync(filePath);
        if (content === null) {
            return new Event();
        }
        return this.parseText(content, filePath);
    }

    public parseText(text: string, sourceName: string = 'text'): Event {
        this.issues = [];
        const sectionData: SectionData[] = [];
        const pendingPersonSelections: PersonSelection[] = [];
        const current = (): SectionData | undefined => sectionData[sectionData.length - 1];
        const lines = text.split(/\r?\n/);

        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            const trimmedLine = line.trim();
            const section = current();

            if (trimmedLine === '') {
                // Keep blank lines between text lines (leading/trailing ones are dropped later)
                if (section && section.textLines.length > 0) {
                    section.textLines.push('');
                }
                return;
            }

            if (trimmedLine.startsWith('//')) {
                // Comment: skip the line
                return;
            }

            if (trimmedLine.startsWith('*')) {
                // Person selection: *A: magic or *B: -magic
                const selection = PersonSelection.parse(trimmedLine.substring(1).trim());
                if (!selection) {
                    this.addIssue(lineNumber, `Invalid role selection '${trimmedLine}'`);
                } else if (section) {
                    section.personSelections.push(selection);
                } else {
                    // Before the first section: belongs to the first section
                    pendingPersonSelections.push(selection);
                }
                return;
            }

            if (trimmedLine.startsWith('§')) {
                const sectionMatch = trimmedLine.match(/^§(\d+)/);
                if (!sectionMatch) {
                    this.addIssue(lineNumber, `Section without a number '${trimmedLine}'`);
                }
                const sectionNumber = sectionMatch ? parseInt(sectionMatch[1], 10) : null;
                if (sectionNumber !== null && sectionData.some(s => s.sectionNumber === sectionNumber)) {
                    this.addIssue(lineNumber, `Duplicate section number §${sectionNumber}`);
                }
                const sectionText = trimmedLine.substring(sectionMatch ? sectionMatch[0].length : 1).trim();
                sectionData.push({
                    line: lineNumber,
                    textLines: sectionText === '' ? [] : [sectionText],
                    sectionNumber,
                    effects: [],
                    personSelections: sectionData.length === 0 ? pendingPersonSelections.splice(0) : [],
                    choiceConfigs: []
                });
                return;
            }

            if (!section) {
                this.addIssue(lineNumber, `Ignored line before the first section: '${trimmedLine}'`);
                return;
            }

            if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
                const effectContent = trimmedLine.substring(1, trimmedLine.length - 1).trim();
                const effect = EffectFactory.parseEffect(effectContent, lineNumber, this.issues);
                if (effect) {
                    section.effects.push(effect);
                }
                return;
            }

            if (trimmedLine.startsWith('#')) {
                // Choice. Syntax: #2 text OR #2 (x?) text OR #2 (gold>5?) text
                const choiceMatch = trimmedLine.match(/^#(\d+)\s*(.*)$/);
                if (!choiceMatch) {
                    this.addIssue(lineNumber, `Invalid choice '${trimmedLine}'`);
                    return;
                }
                const targetSectionNumber = parseInt(choiceMatch[1], 10);
                let choiceText = choiceMatch[2].trim();
                let prerequisite: Prerequisite | null = null;

                // Optional prerequisite at the start: (var?) or (var>num?) or (can task)
                const prerequisiteMatch = choiceText.match(/^\(([^)]+)\)\s*(.*)$/);
                if (prerequisiteMatch) {
                    const innerContent = prerequisiteMatch[1];
                    const displayText = prerequisiteMatch[2].trim();
                    
                    // Try VariablePrerequisite first (handles (x?), (gold>5?), (gold 5?))
                    const varParsed = VariablePrerequisite.parse(`(${innerContent})`);
                    if (varParsed) {
                        prerequisite = varParsed.prerequisite;
                        choiceText = displayText;
                    } else {
                        // Try CanDoTaskPrerequisite (handles (can fish), (can mine))
                        const taskParsed = CanDoTaskPrerequisite.parse(innerContent);
                        if (taskParsed) {
                            prerequisite = taskParsed.prerequisite;
                            choiceText = displayText;
                        } else {
                            this.addIssue(lineNumber, `Invalid choice condition '(${innerContent})'`);
                        }
                    }
                }
                section.choiceConfigs.push({ line: lineNumber, targetSectionNumber, choiceText, prerequisite });
                return;
            }

            // Regular text - add to current section
            section.textLines.push(trimmedLine);
        });

        if (pendingPersonSelections.length > 0) {
            this.addIssue(1, `Role selections but no sections`);
        }

        // Create all sections first, then link choices (choices may point forward)
        const sections = sectionData.map(data => {
            const text = EventParser.joinLines(data.textLines);
            this.checkTags(text, data.line);
            return new Section(text, data.effects, [], data.personSelections, data.sectionNumber);
        });

        sectionData.forEach((data, i) => {
            const choices = data.choiceConfigs.map(config => {
                // A missing target section is allowed: the choice ends the dialog
                const targetSection = sections.find(s => s.getSectionNumber() === config.targetSectionNumber);
                return new Choice(config.choiceText, config.prerequisite ? [config.prerequisite] : [], targetSection);
            });
            sections[i].setChoices(choices);
        });

        for (const issue of this.issues) {
            console.warn(`${sourceName}:${issue.line}: ${issue.message}`);
        }

        return new Event(sections);
    }

    private addIssue(line: number, message: string): void {
        this.issues.push({ line, message });
    }

    // Join text lines with '\n', without leading/trailing blank lines
    private static joinLines(lines: string[]): string {
        let end = lines.length;
        while (end > 0 && lines[end - 1] === '') end--;
        return lines.slice(0, end).join('\n');
    }

    // Warn about unbalanced < > in a section's text (reported at the section's line)
    private checkTags(text: string, lineNumber: number): void {
        let depth = 0;
        for (const c of text) {
            if (c === '<') depth++;
            else if (c === '>') depth--;
            if (depth < 0) break;
        }
        if (depth !== 0) {
            this.addIssue(lineNumber, `Unbalanced < > in section text`);
        }
    }
}
