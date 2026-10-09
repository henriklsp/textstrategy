import { Person, Gender } from './Person';
import { PrerequisiteContext } from './Prerequisite';
import { PrerequisiteParser } from './PrerequisiteParser';

// What the substitution needs from the Dialog: game state, role assignments,
// random picks, and captured choice variables.
export interface TextSubstitutionContext extends PrerequisiteContext {
    // Pick an option index in [0, count) for the next random subsection (<?a;b>).
    // Called once per random subsection, in the order they appear in the text.
    pickRandom(count: number): number;
    // Get a captured choice variable value
    getChoiceVariable(variableName: string): string | undefined;
}

// Replaces variable subsections in dialog text with their current values.
// Only resolves <...> tags; the rest of the text (including line breaks) is returned unchanged.
// Tags can be nested, e.g. <x?<?a;b>;c>.
//
//   <A>                 name of the person in role A (also sets current role to A)
//   <A he>              pronoun: he/she depending on gender of person in role A (sets current role to A)
//   <he>                pronoun for current role (uses most recent role from <A>, <B>, etc.)
//   <food>              current value of numeric variable food
//   <currentconstruction> name of the building currently under construction (empty if none)
//   <food?>             value of food (numeric), or true/false for a boolean flag
//   <?a;b;c>            random pick of one option
//   <x?a;b>             a if x is "truthy" (flag set, or number not 0), else b
//   <x?a>               a if x is truthy, else nothing
//   <food 2?a;b>        a if food >= 2, else b
//   <can fish?a;b>      a if fishing can be performed, else b (any prerequisite type works)
//   <A life?a;b>        a if the person in role A has positive trait life, else b
//   <A -magic?a;b>      a if the person in role A has negative trait magic
//
// Supported pronouns: he, him, his, hers, himself (case-sensitive for capitalization)
// The current role is reset at the start of each text substitution.
// Options are trimmed. Unknown tags are left as-is (visible) so mistakes are easy to spot.
export class TextSubstitution {
    // Pronoun mappings: base pronoun -> { male: string, female: string }
    private static readonly PRONOUN_MAP: Record<string, { male: string; female: string }> = {
        'he': { male: 'he', female: 'she' },
        'him': { male: 'him', female: 'her' },
        'his': { male: 'his', female: 'her' },
        'hers': { male: 'his', female: 'hers' },
        'himself': { male: 'himself', female: 'herself' },
    };
    private readonly context: TextSubstitutionContext;
    private currentRole: string | null = null;

    constructor(context: TextSubstitutionContext) {
        this.context = context;
    }

    public substitute(text: string): string {
        this.currentRole = null; // Reset current role at the start of each substitution
        let output = '';
        let i = 0;
        while (i < text.length) {
            if (text[i] === '<') {
                const close = TextSubstitution.findClosing(text, i);
                if (close === -1) {
                    // Unbalanced: keep the rest literally
                    output += text.substring(i);
                    break;
                }
                output += this.substituteTag(text.substring(i + 1, close));
                i = close + 1;
            } else {
                output += text[i];
                i++;
            }
        }
        return output;
    }

    private substituteTag(inner: string): string {
        const questionMark = TextSubstitution.indexOfTopLevel(inner, '?');

        if (questionMark === -1) {
            const trimmed = inner.trim();
            const spaceIndex = trimmed.indexOf(' ');
            
            // Check for pronoun syntax: <Role pronoun> (e.g., <A he>)
            if (spaceIndex > 0) {
                const roleName = trimmed.substring(0, spaceIndex).trim();
                const pronounText = trimmed.substring(spaceIndex + 1).trim();
                
                // Check if this is a valid pronoun tag
                const pronounResult = this.handlePronounTag(roleName, pronounText);
                if (pronounResult !== null) {
                    this.currentRole = roleName; // Update current role
                    return pronounResult;
                }
            }
            
            // <A> or <food> or <task> (choice variable) or standalone pronoun
            const name = trimmed;
            if (/^\w+$/.test(name)) {
                // Check for standalone pronoun: <he>, <him>, <his>, etc. (uses current role)
                if (this.isPronoun(name)) {
                    if (this.currentRole) {
                        const result = this.handlePronounTag(this.currentRole, name);
                        if (result !== null) return result;
                    }
                    // No current role - return the tag as-is (visible so author can see the mistake)
                    return `<${name}>`;
                }
                
                // Try role first (A, B, C, ...)
                const person = this.context.getPersonForRole(name);
                if (person) {
                    this.currentRole = name; // Update current role
                    return person.getName();
                }

                // Try choice variable (task, person, etc.)
                const choiceVar = this.context.getChoiceVariable(name);
                if (choiceVar !== undefined) return choiceVar;

                // Try numeric variable (rounded to whole number for display)
                const value = this.numericValue(name);
                if (value !== undefined) return Math.round(value).toString();
                
                // Try text variable (like currentconstruction)
                const textValue = this.textValue(name);
                if (textValue !== undefined) return textValue;
                
                // Variable not found - return error indicator that will be visible
                return `<ERROR: ${name} not found>`;
            }
            return `<${inner}>`;
        }

        const condition = inner.substring(0, questionMark).trim();
        const rest = inner.substring(questionMark + 1);
        const options = TextSubstitution.splitTopLevel(rest, ';').map(option => option.trim());
        const trueText = options[0] ?? '';
        const falseText = options[1] ?? '';

        // <?a;b;c> random pick
        if (condition === '') {
            return this.substitute(options[this.context.pickRandom(options.length)]);
        }

        // <food?> display value (rounded to whole number), or true/false for a flag
        if (rest.trim() === '' && /^\w+$/.test(condition)) {
            const value = this.numericValue(condition);
            if (value !== undefined) return Math.round(value).toString();
            return this.context.dataModel.isSet(condition) ? 'true' : 'false';
        }

        // <currentconstruction?a;b>: truthy if something is under construction
        if (condition === 'currentconstruction') {
            return this.substitute((this.textValue('currentconstruction') ?? '') !== '' ? trueText : falseText);
        }

        // Conditional subsection: <cond?a;b>
        // Uses the same PrerequisiteParser.parseCondition as choice prerequisites
        // (PrerequisiteParser.ts), so every prerequisite type works in both places:
        // <hasDoneIt?a;b>, <food 2?a;b>, <can scavenge?a;b>, ...
        const prerequisite = PrerequisiteParser.parseCondition(condition);
        if (prerequisite) {
            return this.substitute(prerequisite.isMet(this.context) ? trueText : falseText);
        }

        return `<${inner}>`;
    }

    // Numeric value, or undefined if the variable does not exist
    private numericValue(name: string): number | undefined {
        try {
            return this.context.dataModel.has(name) ? this.context.dataModel.get(name) : undefined;
        } catch (e) {
            // Variable access failed - return undefined so error tag is shown
            return undefined;
        }
    }

    // Text value for special text variables (like currentconstruction), or undefined
    private textValue(name: string): string | undefined {
        try {
            // Handle special text variables
            if (name === 'currentconstruction') {
                return this.context.dataModel.getCurrentConstruction();
            }
            return undefined;
        } catch (e) {
            return undefined;
        }
    }

    // Index of the '>' matching the '<' at position start, or -1
    private static findClosing(text: string, start: number): number {
        let depth = 0;
        for (let k = start; k < text.length; k++) {
            if (text[k] === '<') depth++;
            else if (text[k] === '>') {
                depth--;
                if (depth === 0) return k;
            }
        }
        return -1;
    }

    // Index of ch outside any nested <...>, or -1
    private static indexOfTopLevel(text: string, ch: string): number {
        let depth = 0;
        for (let k = 0; k < text.length; k++) {
            if (text[k] === '<') depth++;
            else if (text[k] === '>') depth--;
            else if (text[k] === ch && depth === 0) return k;
        }
        return -1;
    }

    // Check if a word is a recognized pronoun
    private isPronoun(text: string): boolean {
        const base = text.toLowerCase();
        return base in TextSubstitution.PRONOUN_MAP;
    }

    // Handle pronoun tags like <A he>, <B Him>, etc.
    // Returns the substituted pronoun, or null if not a valid pronoun tag
    private handlePronounTag(roleName: string, pronounText: string): string | null {
        // Get the base pronoun (lowercase) to look up in the map
        const basePronoun = pronounText.toLowerCase();
        
        // Check if this is a recognized pronoun
        const pronounMapping = TextSubstitution.PRONOUN_MAP[basePronoun];
        if (!pronounMapping) {
            return null;
        }
        
        // Get the person for this role
        const person = this.context.getPersonForRole(roleName);
        if (!person) {
            return null;
        }
        
        // Get the gender and select the appropriate pronoun
        const gender = person.getGender();
        let resultPronoun = gender === 'male' ? pronounMapping.male : pronounMapping.female;
        
        // Apply capitalization: if the original pronoun was capitalized, capitalize the result
        if (pronounText.length > 0 && pronounText[0] === pronounText[0].toUpperCase()) {
            // Capitalize first letter only (e.g., "He" not "HE")
            resultPronoun = resultPronoun.charAt(0).toUpperCase() + resultPronoun.slice(1).toLowerCase();
        }
        
        return resultPronoun;
    }

    // Split on separator, ignoring separators inside nested <...>
    private static splitTopLevel(text: string, separator: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let current = '';
        for (const c of text) {
            if (c === '<') depth++;
            else if (c === '>') depth--;
            if (c === separator && depth === 0) {
                parts.push(current);
                current = '';
            } else {
                current += c;
            }
        }
        parts.push(current);
        return parts;
    }
}
