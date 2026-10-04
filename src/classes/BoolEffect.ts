import { Effect } from './Effect';
import { DataModel } from './DataModel';

// Sets boolean flag in the data model.
export class BoolEffect implements Effect {
    private readonly name: string;
    private readonly value: boolean;
    
    constructor(name: string, value: boolean) {
        this.name = name;
        this.value = value;
    }
    
    public takeEffect(dataModel: DataModel): void {
        // Store boolean in data model
        dataModel.set(this.name, this.value);
    }

    public getName(): string {
        return this.name;
    }

    public getValue(): boolean {
        return this.value;
    }
}