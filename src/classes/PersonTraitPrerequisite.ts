import { Prerequisite, PrerequisiteContext } from './Prerequisite';
import { Person } from './Person';

// Which version of a trait is required
export type TraitSign = 'positive' | 'negative';

// Prerequisite that checks a trait of the Person assigned to a dialog role.
// Parsed from condition expressions (see PrerequisiteParser.parseCondition):
//   A life    - person in role A (single-letter role) has positive trait life
//   A -magic  - person in role A has negative trait magic
// Not met if the role has no Person assigned.
// Note: tertiary traits are only used in role selection scoring (tiebreaks),
// not for prerequisites.
export class PersonTraitPrerequisite extends Prerequisite {
    private readonly roleName: string;
    private readonly traitName: string;
    private readonly sign: TraitSign;

    constructor(roleName: string, traitName: string, sign: TraitSign = 'positive') {
        super(() => false); // Not used: isMet is overridden
        this.roleName = roleName;
        this.traitName = traitName;
        this.sign = sign;
    }

    public getRoleName(): string {
        return this.roleName;
    }

    public getTraitName(): string {
        return this.traitName;
    }

    public getSign(): string {
        return this.sign;
    }

    // Check the assigned person's trait. Unassigned role: not met.
    public isMet(context: PrerequisiteContext): boolean {
        const person = context.getPersonForRole(this.roleName);
        if (!person) {
            return false;
        }
        switch (this.sign) {
            case 'positive': return person.hasPositiveTrait(this.traitName);
            case 'negative': return person.hasNegativeTrait(this.traitName);
        }
    }

    // Parse a condition expression (without outer parentheses; trailing '?'
    // already stripped by PrerequisiteParser.parseCondition) like "A life" or
    // "A -magic". Returns the prerequisite, or null if no match.
    // Sign convention matches person selection: none = positive, '-' = negative.
    public static parseCondition(condition: string): PersonTraitPrerequisite | null {
        // Role (a single letter, like the *A: person selection roles),
        // optional sign, trait name. Single-letter roles keep unknown two-word
        // conditions like "foo bar" from being silently read as role/trait.
        const match = condition.match(/^([A-Za-z])\s+(-?)(\w+)$/);
        if (!match) {
            return null;
        }
        const sign: TraitSign = match[2] === '-' ? 'negative' : 'positive';
        return new PersonTraitPrerequisite(match[1], match[3], sign);
    }
}
