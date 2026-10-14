import { Section } from './Section';
import { DataModel } from './DataModel';
import { Person } from './Person';
import { Prerequisite, PrerequisiteContext } from './Prerequisite';

// How an event is triggered:
// - scheduled (default): only runs when another event's [event name n] effect
//   puts it on the queue; header conditions act as a gate (requeued when unmet)
// - when: registered in the GameLoop pool; fires by itself on the day all its
//   header conditions are met (on a day with no scheduled events due)
// - maybe: like when, but only considered if no ?when event can fire that day
export type TriggerMode = 'scheduled' | 'when' | 'maybe';

// Container for game narrative. Holds Section[] and startingSection.
// The dialog tree consists of a number of linked Sections.
// Each Section can have PersonSelection requirements for role-based dialog.
// The Event can have Prerequisites (from (cond?) lines in the file header)
// and a trigger mode (?when / ?maybe lines in the header).
export class Event {
    private readonly sections: Section[];
    private readonly startingSection: Section | null;
    private readonly prerequisites: Prerequisite[];
    private readonly trigger: TriggerMode;
    // Lower priority number fires first among pool candidates (default 0)
    private readonly priority: number;

    // startingSection defaults to the first section
    constructor(sections: Section[] = [], startingSection?: Section | null, prerequisites: Prerequisite[] = [],
                trigger: TriggerMode = 'scheduled', priority: number = 0) {
        this.sections = sections;
        this.startingSection = startingSection !== undefined ? startingSection : (sections[0] ?? null);
        this.prerequisites = prerequisites;
        this.trigger = trigger;
        this.priority = priority;
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

    // The trigger mode from the header (?when / ?maybe), 'scheduled' by default
    public getTrigger(): TriggerMode {
        return this.trigger;
    }

    // Lower number = fires first among pool candidates of the same tier
    public getPriority(): number {
        return this.priority;
    }
}
