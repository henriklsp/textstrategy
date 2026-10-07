import { Event } from './Event';
import { Section } from './Section';
import { Choice } from './Choice';
import { DataModel } from './DataModel';
import { EffectContext } from './Effect';
import { Person } from './Person';
import { PersonSelection } from './PersonSelection';
import { TextSubstitution, TextSubstitutionContext } from './TextSubstitution';
import { RoleAssigner } from './RoleAssigner';
import { PrerequisiteContext } from './Prerequisite';

// Callback interface for dialog events
export interface DialogCallback {
    onDialogEnd: () => void;
    onDialogUpdated: () => void;
    onError?: (error: string | Error) => void;
}

// Scheduler callback for effects (optional; needed for EventEffect)
export type EffectScheduler = (eventName: string, delayDays: number) => void;

// Handles all dialog logic: navigation, effects, and completion.
// UI calls dialogChoiceSelected when user makes a choice.
// A choice that points to a non-existent section ends the dialog.
// A section without (visible) choices is the end of the dialog: the UI decides how
// to let the player move on, and calls endDialog().
export class Dialog implements EffectContext, TextSubstitutionContext, PrerequisiteContext {
    public readonly dataModel: DataModel;
    private event: Event;
    private currentSection: Section | null = null;
    private callback: DialogCallback;
    private effectScheduler: EffectScheduler | null = null;
    private isActive: boolean = false;
    private roleToPerson: Map<string, Person>;
    private readonly substitution: TextSubstitution;
    // Random subsection picks (<?a;b>) for the current section, by order of occurrence.
    // Picked once when the section is entered, so showing the text again does not change it.
    private randomPicks: number[] = [];
    private randomCursor = 0;
    // Choice variables: capture player choices for use in text and effects
    private choiceVariables: Map<string, string> = new Map();
    private pendingChoiceCapture: string | null = null;

    constructor(event: Event, dataModel: DataModel, callback: DialogCallback) {
        this.event = event;
        this.dataModel = dataModel;
        this.callback = callback;
        this.roleToPerson = new Map<string, Person>();
        this.substitution = new TextSubstitution(this);
    }

    // Set the scheduler callback for effects that need to schedule events
    public setEffectScheduler(scheduler: EffectScheduler): void {
        this.effectScheduler = scheduler;
    }

    // Start the dialog at the first section
    public start(): void {
        try {
            const startingSection = this.event.getStartingSection();
            if (!startingSection) {
                const errorMsg = "No starting section found in event";
                console.error(errorMsg);
                this.reportError(errorMsg);
                this.isActive = false;
                this.callback.onDialogEnd();
                return;
            }
            this.isActive = true;
            // Reset choice variables at dialog start
            this.choiceVariables.clear();
            this.pendingChoiceCapture = null;
            this.enterSection(startingSection);
        } catch (error) {
            this.reportError(error as Error);
            this.isActive = false;
            this.callback.onDialogEnd();
        }
    }

    // Current section (null before start or if the event has no sections)
    public getCurrentSection(): Section | null {
        return this.currentSection;
    }

    // EffectContext / TextRenderContext: the Person selected for a dialog role (A, B, ...)
    public getPersonForRole(roleName: string): Person | undefined {
        return this.roleToPerson.get(roleName);
    }

    // EffectContext: Set pending choice capture for the next choice
    public setPendingChoiceCapture(variableName: string): void {
        this.pendingChoiceCapture = variableName;
    }

    // EffectContext: Get a previously captured choice variable
    public getChoiceVariable(variableName: string): string | undefined {
        return this.choiceVariables.get(variableName);
    }

    // EffectContext: schedule an event (used by EventEffect)
    public scheduleEvent(eventName: string, delayDays: number): void {
        if (this.effectScheduler) {
            this.effectScheduler(eventName, delayDays);
        }
    }

    // TextRenderContext: random pick for the next <?...> in the current section
    public pickRandom(count: number): number {
        const k = this.randomCursor++;
        let index = this.randomPicks[k];
        if (index === undefined || index >= count) {
            index = Math.floor(Math.random() * count);
            this.randomPicks[k] = index;
        }
        return index;
    }

    // Report an error through the callback if available
    private reportError(error: string | Error): void {
        if (this.callback.onError) {
            this.callback.onError(error);
        }
    }

    // Get the text of the current section with variable substitutions.
    // Line breaks from the source text are kept; the UI decides how to lay them out.
    public getCurrentText(): string {
        if (!this.currentSection) return "";
        this.randomCursor = 0;
        return this.substitution.substitute(this.currentSection.getText());
    }

    // Get available choices for the current section with role substitutions (<A>, <B>, ...).
    // Other variable types are not processed in choices.
    // An empty list means the dialog is at its end (see endDialog).
    public getCurrentChoices(): Choice[] {
        if (!this.currentSection) return [];
        return this.getVisibleChoices(this.currentSection).map(choice => {
            const originalText = choice.getText();
            const processedText = originalText.replace(/<([A-Za-z]\w*)>/g, (match, roleName) => {
                const person = this.roleToPerson.get(roleName);
                return person ? person.getName() : match;
            });

            // If the text changed, create a new Choice with the processed text
            // Keep the same prerequisites and section reference
            if (processedText !== originalText) {
                return new Choice(processedText, choice.getPrerequisites(), choice.getSection());
            }
            return choice;
        });
    }

    // Called by UI when user selects a choice
    public dialogChoiceSelected(choice: Choice): void {
        if (!this.isActive) return;

        try {
            // Capture choice if pending
            if (this.pendingChoiceCapture) {
                const choiceText = choice.getText();
                this.choiceVariables.set(this.pendingChoiceCapture, choiceText);
                this.pendingChoiceCapture = null;
            }

            const targetSection = choice.getSection();
            if (!targetSection) {
                // Target section does not exist - dialog ends
                this.endDialog();
                return;
            }

            // Navigate to the target section (resolves roles and applies its effects)
            this.enterSection(targetSection);

            // Update the UI with the new section
            this.callback.onDialogUpdated();
        } catch (error) {
            this.reportError(error as Error);
            this.callback.onDialogUpdated();
        }
    }

    // End the dialog (e.g. when the player moves on from a section without choices)
    public endDialog(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this.callback.onDialogEnd();
    }

    // Choices whose prerequisites are met (checked against this Dialog, so
    // prerequisites can use the DataModel and the current role assignments)
    private getVisibleChoices(section: Section): Choice[] {
        return section.getChoices().filter(choice => choice.arePrerequisitesMet(this));
    }

    // Enter a section: reset random picks, resolve roles, then apply effects
    private enterSection(section: Section): void {
        this.currentSection = section;
        this.randomPicks = [];
        try {
            this.resolvePersonSelections();
            this.applyCurrentSectionEffects();
        } catch (error) {
            this.reportError(error as Error);
            throw error;
        }
    }

    // Resolve PersonSelections for the current section.
    // Finds the assignment of Persons to roles with the highest total score.
    // Existing role assignments are preserved unless the role appears again in this section.
    // Throws if the section has more roles than there are characters.
    private resolvePersonSelections(): void {
        if (!this.currentSection) return;

        const selections = this.currentSection.getPersonSelections();
        if (selections.length === 0) return;

        const cast = this.dataModel.getCast();
        try {
            const best = RoleAssigner.findBestAssignment(selections, cast);
            selections.forEach((selection, i) => this.roleToPerson.set(selection.getRoleName(), best[i]));
        } catch (error) {
            const sectionNumber = this.currentSection.getSectionNumber();
            throw new Error(`Section ${sectionNumber ?? '?'}: ${(error as Error).message}`);
        }
    }

    // Apply effects from the current section
    private applyCurrentSectionEffects(): void {
        if (!this.currentSection) return;
        for (const effect of this.currentSection.getEffects()) {
            try {
                effect.takeEffect(this.dataModel, this);
            } catch (error) {
                this.reportError(error as Error);
                throw error;
            }
        }
    }
}
