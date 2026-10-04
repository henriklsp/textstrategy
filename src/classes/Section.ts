import { Effect } from './Effect';
import { Choice } from './Choice';
import { PersonSelection } from './PersonSelection';

// A node in a dialog tree. Contains text, Effect[], and Choice[] for branching to other sections.
export class Section {
    private readonly sectionNumber: number | null;
    private readonly text: string;
    private readonly effects: Effect[];
    private choices: Choice[];
    private readonly personSelections: PersonSelection[];

    constructor(
        text: string,
        effects: Effect[] = [],
        choices: Choice[] = [],
        personSelections: PersonSelection[] = [],
        sectionNumber: number | null = null
    ) {
        this.text = text;
        this.effects = effects;
        this.choices = choices;
        this.personSelections = personSelections;
        this.sectionNumber = sectionNumber;
    }

    public getSectionNumber(): number | null {
        return this.sectionNumber;
    }

    public getText(): string {
        return this.text;
    }

    public getEffects(): Effect[] {
        return this.effects;
    }

    public getChoices(): Choice[] {
        return this.choices;
    }

    // Used by EventParser: choices can only be linked after all sections exist,
    // because choices reference other sections (possibly later in the file).
    public setChoices(choices: Choice[]): void {
        this.choices = choices;
    }

    public getPersonSelections(): PersonSelection[] {
        return this.personSelections;
    }
}
