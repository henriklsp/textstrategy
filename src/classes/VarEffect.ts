import { Effect } from './Effect';
import { DataModel } from './DataModel';

// Modifies a variable in the data model.
export class VarEffect implements Effect {
    private readonly name: string;
    private readonly value: number;

    constructor(name: string, value: number) {
        this.name = name;
        this.value = value;
    }

    public takeEffect(dataModel: DataModel): void {
        dataModel.adjust(this.name, this.value);
    }

    public getName(): string {
        return this.name;
    }

    public getValue(): number {
        return this.value;
    }
}