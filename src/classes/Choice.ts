import { Section } from './Section';
import { Prerequisite } from './Prerequisite';
import { DataModel } from './DataModel';

// Player option. Links to target Section with Prerequisite[] checks via arePrerequisitesMet().
// A Choice without a target section ends the dialog.
export class Choice {
    private readonly text: string;
    private readonly prerequisites: Prerequisite[];
    private readonly section: Section | undefined;

    constructor(text: string, prerequisites: Prerequisite[] = [], section: Section | undefined = undefined) {
        this.text = text;
        this.prerequisites = prerequisites;
        this.section = section;
    }

    public getText(): string {
        return this.text;
    }

    public getPrerequisites(): Prerequisite[] {
        return this.prerequisites;
    }

    public getSection(): Section | undefined {
        return this.section;
    }

    public arePrerequisitesMet(dataModel: DataModel): boolean {
        return this.prerequisites.every(prerequisite => prerequisite.isMet(dataModel));
    }
}
