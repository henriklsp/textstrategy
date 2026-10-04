import { DataModel } from './DataModel';

// Generic condition wrapper.
// An Event can have Prerequisites for triggering
// A dialog Choice can have Prerequisites for being available
// All prerequisites are checked against the DataModel via isMet(dataModel).
export class Prerequisite {
    private readonly condition: (dataModel: DataModel) => boolean;

    constructor(condition: (dataModel: DataModel) => boolean) {
        this.condition = condition;
    }

    public isMet(dataModel: DataModel): boolean {
        return this.condition(dataModel);
    }
}
