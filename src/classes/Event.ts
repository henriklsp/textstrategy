import { Section } from './Section';
import { DataModel } from './DataModel';
import { Person } from './Person';
import { Prerequisite, PrerequisiteContext } from './Prerequisite';

// Container for game narrative. Holds Section[] and startingSection.
// The dialog tree consists of a number of linked Sections.
// Each Section can have PersonSelection requirements for role-based dialog.
// The Event can have Prerequisites (from (cond?) lines in the file header).
// How an event triggers is decided outside the file: scheduled events are put
// on the queue by [event name n] effects; pool events are registered in the
// pool manifest (text/pool.txt) or with GameLoop.registerPoolEvent().
export class Event {
    private readonly sections: Section[];
    private readonly startingSection: Section | null;
    private readonly prerequisites: Prerequisite[];

    // startingSection defaults to the first section
    constructor(sections: Section[] = [], startingSection?: Section | null, prerequisites: Prerequisite[] = []) {
        this.sections = sections;
        this.startingSection = startingSection !== undefined ? startingSection : (sections[0] ?? null);
        this.prerequisites = prerequisites;
    }

    public getSections(): Section[] {
        return this.sections;
    }

    public getStartingSection(): Section | null {
        return this.startingSection;
    }

    // The event's header conditions ((cond?) lines before the first section).
    // Checked by the GameLoop when the event comes due.
    public getPrerequisites(): Prerequisite[] {
        return [...this.prerequisites];
    }

    // True if all header prerequisites are met against the given game state.
    // Checked outside any dialog, so no roles are assigned: person trait
    // conditions like (A life?) are never met for event prerequisites.
    public arePrerequisitesMet(dataModel: DataModel): boolean {
        const context: PrerequisiteContext = {
            dataModel,
            getPersonForRole: (_roleName: string): Person | undefined => undefined
        };
        return this.prerequisites.every(prerequisite => prerequisite.isMet(context));
    }
}
