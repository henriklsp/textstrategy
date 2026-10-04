import { Effect, EffectContext } from './Effect';
import { DataModel } from './DataModel';

export class SetChoiceEffect implements Effect {
    private readonly variableName: string;

    constructor(variableName: string) {
        this.variableName = variableName;
    }

    public takeEffect(dataModel: DataModel, context?: EffectContext): void {
        if (context) {
            context.setPendingChoiceCapture(this.variableName);
        }
    }

    public getVariableName(): string {
        return this.variableName;
    }
}
