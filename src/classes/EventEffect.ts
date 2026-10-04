import { Effect, EffectContext } from './Effect';
import { DataModel } from './DataModel';

// Triggers an event
export class EventEffect implements Effect {
    private readonly eventName: string;
    private readonly delay: number; //days

    constructor(eventName: string, delay: number = 0) {
        this.eventName = eventName;
        this.delay = delay;
    }

    public takeEffect(_dataModel: DataModel, context?: EffectContext): void {
        if (context?.scheduleEvent) {
            context.scheduleEvent(this.eventName, this.delay);
        }
    }

    public getEventName(): string {
        return this.eventName;
    }

    public getDelay(): number {
        return this.delay;
    }
}