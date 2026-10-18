import { PersonStatEffect } from '../src/classes/PersonStatEffect';
import { EffectFactory, ParseIssue } from '../src/classes/EffectFactory';
import { DataModel } from '../src/classes/DataModel';
import { Dialog } from '../src/classes/Dialog';
import { Event } from '../src/classes/Event';
import { EventParser } from '../src/classes/EventParser';
import { Section } from '../src/classes/Section';
import { Choice } from '../src/classes/Choice';
import { Person } from '../src/classes/Person';
import { PersonSelection } from '../src/classes/PersonSelection';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };

describe('PersonStatEffect', () => {
    let dm: DataModel;
    let alice: Person;

    beforeEach(() => {
        dm = new DataModel();
        alice = new Person('Alice', 'life', 'magic', 'harmony');
        dm.addPerson(alice);
    });

    test('can adjust health by a negative amount', () => {
        const effect = new PersonStatEffect('A', 'health', -40);
        const context = {
            getPersonForRole: (role: string) => role === 'A' ? alice : undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };
        effect.takeEffect(dm, context as any);
        expect(alice.getHealth()).toBe(60);
    });

    test('can adjust health by a positive amount', () => {
        alice.setHealth(50);
        const effect = new PersonStatEffect('A', 'health', 5);
        const context = {
            getPersonForRole: (role: string) => role === 'A' ? alice : undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };
        effect.takeEffect(dm, context as any);
        expect(alice.getHealth()).toBe(55);
    });

    test('health clamps between 0 and maxHealth', () => {
        const context = {
            getPersonForRole: () => alice,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };
        new PersonStatEffect('A', 'health', -500).takeEffect(dm, context as any);
        expect(alice.getHealth()).toBe(0);

        new PersonStatEffect('A', 'health', 500).takeEffect(dm, context as any);
        expect(alice.getHealth()).toBe(100);
    });

    test('can adjust attitude and clamps between 0 and 100', () => {
        const context = {
            getPersonForRole: () => alice,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };
        new PersonStatEffect('A', 'attitude', -10).takeEffect(dm, context as any);
        expect(alice.getAttitude()).toBe(40);

        new PersonStatEffect('A', 'attitude', -500).takeEffect(dm, context as any);
        expect(alice.getAttitude()).toBe(0);

        new PersonStatEffect('A', 'attitude', 500).takeEffect(dm, context as any);
        expect(alice.getAttitude()).toBe(100);
    });

    test('resolves the person from a choice variable', () => {
        const effect = new PersonStatEffect('<person>', 'health', -20);
        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: (name: string) => name === 'person' ? 'Alice' : undefined
        };
        effect.takeEffect(dm, context as any);
        expect(alice.getHealth()).toBe(80);
    });

    test('errors when the choice variable was never set', () => {
        const effect = new PersonStatEffect('<person>', 'health', -20);
        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };
        expect(() => effect.takeEffect(dm, context as any)).toThrow("Choice variable 'person' was never set");
    });

    test('errors when the choice variable names someone outside the cast', () => {
        const effect = new PersonStatEffect('<person>', 'health', -20);
        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => 'Bob'
        };
        expect(() => effect.takeEffect(dm, context as any)).toThrow("Person 'Bob' is not in the cast");
    });

    test('errors when no person is assigned to the role', () => {
        const effect = new PersonStatEffect('B', 'attitude', -10);
        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };
        expect(() => effect.takeEffect(dm, context as any)).toThrow("No person assigned to role 'B'");
    });

    test('EffectFactory parses [person A health -40]', () => {
        const issues: ParseIssue[] = [];
        const effect = EffectFactory.parseEffect('person A health -40', 1, issues);
        expect(issues).toEqual([]);
        expect(effect).toBeInstanceOf(PersonStatEffect);
        const statEffect = effect as PersonStatEffect;
        expect(statEffect.getPersonRef()).toBe('A');
        expect(statEffect.getStat()).toBe('health');
        expect(statEffect.getDelta()).toBe(-40);
    });

    test('EffectFactory parses [person B attitude +5] and [person <person> attitude -10]', () => {
        const issues: ParseIssue[] = [];
        const effect = EffectFactory.parseEffect('person B attitude +5', 1, issues);
        expect(issues).toEqual([]);
        expect((effect as PersonStatEffect).getDelta()).toBe(5);

        const varEffect = EffectFactory.parseEffect('person <person> attitude -10', 2, issues);
        expect(issues).toEqual([]);
        expect((varEffect as PersonStatEffect).getPersonRef()).toBe('<person>');
    });

    test('EffectFactory rejects unknown stats and non-numeric values', () => {
        const issues: ParseIssue[] = [];
        expect(EffectFactory.parseEffect('person A mood -40', 1, issues)).toBeNull();
        expect(EffectFactory.parseEffect('person A health abc', 2, issues)).toBeNull();
        expect(EffectFactory.parseEffect('person A health', 3, issues)).toBeNull();
        expect(issues.length).toBe(3);
    });

    test('parsed [person A health -10] fires in a dialog and affects the role person', () => {
        const parser = new EventParser();
        const eventText = `
*A: life
§1
[person A health -10]
#2 Continue

§2
Done.
`;
        const event = parser.parseText(eventText);
        const dialog = new Dialog(event, dm, noop);
        dialog.start();

        expect(alice.getHealth()).toBe(90);
    });

    test('health drop can force a role person below forced rest threshold', () => {
        const s2 = new Section('Done', [], []);
        const s1 = new Section('Hurt', [new PersonStatEffect('A', 'health', -90)], [
            new Choice('Continue', [], s2)
        ], [PersonSelection.createSingle('A', 'life')]);
        const dialog = new Dialog(new Event([s1, s2], s1), dm, noop);
        dialog.start();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);

        expect(alice.getHealth()).toBe(10);
        // A character at or below the default forced rest threshold (25) cannot work
        expect(dm.isFitForWork(alice)).toBe(false);
    });
});
