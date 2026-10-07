import { DataModel } from './DataModel';
import { Person } from './Person';

// What prerequisites may need to evaluate: game state plus the current
// dialog role assignments. Dialog and TextSubstitutionContext both implement this.
export interface PrerequisiteContext {
    readonly dataModel: DataModel;
    getPersonForRole(roleName: string): Person | undefined;
}

// Generic condition wrapper.
// An Event can have Prerequisites for triggering
// A dialog Choice can have Prerequisites for being available
// A text substitution condition (<cond?a;b>) uses the same Prerequisites.
// All prerequisites are checked via isMet(context).
// Conditions are parsed with PrerequisiteParser.parseCondition (see PrerequisiteParser.ts).
export class Prerequisite {
    private readonly condition: (context: PrerequisiteContext) => boolean;

    constructor(condition: (context: PrerequisiteContext) => boolean) {
        this.condition = condition;
    }

    public isMet(context: PrerequisiteContext): boolean {
        return this.condition(context);
    }
}
