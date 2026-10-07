import { DataModel } from './DataModel';

// Generic condition wrapper.
// An Event can have Prerequisites for triggering
// A dialog Choice can have Prerequisites for being available
// A text substitution condition (<cond?a;b>) uses the same Prerequisites.
// All prerequisites are checked against the DataModel via isMet(dataModel).
// Conditions are parsed with PrerequisiteParser.parseCondition (see PrerequisiteParser.ts).
export class Prerequisite {
    private readonly condition: (dataModel: DataModel) => boolean;

    constructor(condition: (dataModel: DataModel) => boolean) {
        this.condition = condition;
    }

    public isMet(dataModel: DataModel): boolean {
        return this.condition(dataModel);
    }
}
