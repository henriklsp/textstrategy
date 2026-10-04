import { Section } from './Section';

// Container for game narrative. Holds Section[] and startingSection.
// The dialog tree consists of a number of linked Sections.
// Each Section can have PersonSelection requirements for role-based dialog.
export class Event {
    private readonly sections: Section[];
    private readonly startingSection: Section | null;

    // startingSection defaults to the first section
    constructor(sections: Section[] = [], startingSection?: Section | null) {
        this.sections = sections;
        this.startingSection = startingSection !== undefined ? startingSection : (sections[0] ?? null);
    }

    public getSections(): Section[] {
        return this.sections;
    }

    public getStartingSection(): Section | null {
        return this.startingSection;
    }
}
