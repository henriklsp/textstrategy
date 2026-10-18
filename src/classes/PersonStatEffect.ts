import { Effect, EffectContext } from './Effect';
import { DataModel } from './DataModel';
import { Person } from './Person';

// Adjustable person stats exposed to dialog effects.
export const PERSON_STATS = ['health', 'attitude'] as const;
export type PersonStat = typeof PERSON_STATS[number];

export function isPersonStat(value: string): value is PersonStat {
    return (PERSON_STATS as readonly string[]).includes(value);
}

// Adjusts a person's health or attitude.
// The person can be referenced by:
//   - Role name (A, B, C, etc.) from the current dialog
//   - Choice variable reference (<person>) from captured player choices
// Health is clamped between 0 and maxHealth (0 = out of action),
// attitude between 0 (hostile) and 100 (devoted); both clamp in Person itself.
export class PersonStatEffect implements Effect {
    private readonly personRef: string;  // role name or choice variable like <person>
    private readonly stat: PersonStat;
    private readonly delta: number;
    private isPersonVar: boolean;

    constructor(personRef: string, stat: PersonStat, delta: number) {
        this.personRef = personRef;
        this.stat = stat;
        this.delta = delta;
        this.isPersonVar = personRef.startsWith('<') && personRef.endsWith('>');
    }

    public takeEffect(dataModel: DataModel, context?: EffectContext): void {
        // Resolve person reference (same scheme as AssignTaskEffect)
        let person: Person | undefined;
        if (this.isPersonVar) {
            const varName = this.personRef.slice(1, -1);
            const personName = context?.getChoiceVariable(varName);
            if (!personName) {
                throw new Error(`Choice variable '${varName}' was never set`);
            }
            person = dataModel.getCast().find(p => p.getName() === personName);
            if (!person) {
                throw new Error(`Person '${personName}' is not in the cast`);
            }
        } else {
            // Role-based
            person = context?.getPersonForRole(this.personRef);
            if (!person) {
                throw new Error(`No person assigned to role '${this.personRef}'`);
            }
        }

        if (this.stat === 'health') {
            person.setHealth(person.getHealth() + this.delta);
        } else {
            person.adjustAttitude(this.delta);
        }
    }

    public getPersonRef(): string {
        return this.personRef;
    }

    public getStat(): PersonStat {
        return this.stat;
    }

    public getDelta(): number {
        return this.delta;
    }
}
