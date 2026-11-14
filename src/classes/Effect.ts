// Interface for all effect types. Requires takeEffect() method.
// Anything that causes a change to the data model implements Effect
// Effects are usually triggered by a section in the dialog tree.
import { DataModel } from './DataModel';
import { Person } from './Person';

// Context supplied by the Dialog that triggers the effect.
// Lets effects resolve dialog roles (A, B, C...) to the Persons selected for them.
// Also provides callbacks for effects to interact with the game loop.
export interface EffectContext {
    getPersonForRole(roleName: string): Person | undefined;
    // Schedule a named event after delayDays days (optional, only provided if needed)
    scheduleEvent?(eventName: string, delayDays: number): void;
    // Store pending choice capture directive from SetChoiceEffect
    setPendingChoiceCapture(variableName: string): void;
    // Get a previously captured choice variable value
    getChoiceVariable(variableName: string): string | undefined;
}

export interface Effect {
    takeEffect(dataModel: DataModel, context?: EffectContext): void;
}