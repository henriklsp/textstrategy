import { EventParser } from '../src/classes/EventParser';
import { Dialog, DialogCallback } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { Person } from '../src/classes/Person';
import { PrerequisiteParser } from '../src/classes/PrerequisiteParser';
import { PersonTraitPrerequisite } from '../src/classes/PersonTraitPrerequisite';

// Person-dependent prerequisites: (A life?) and <A life?a;b> check the trait
// of the Person assigned to dialog role A. Signs: none = positive trait,
// '-' = negative trait, '~' = tertiary trait (same convention as *A: magic).
describe('Person trait prerequisites', () => {
    let parser: EventParser;
    let dataModel: DataModel;
    let callback: DialogCallback;

    beforeEach(() => {
        parser = new EventParser();
        dataModel = new DataModel();
        callback = { onDialogEnd: jest.fn(), onDialogUpdated: jest.fn() };
    });

    function makeCast(): void {
        const person = new Person('Person1');
        person.addPositiveTrait('magic');
        person.addNegativeTrait('life');
        person.addTertiaryTrait('divinity');
        dataModel.addPerson(person);
    }

    describe('parseCondition', () => {
        test('should parse "A life" as positive trait condition', () => {
            const prereq = PrerequisiteParser.parseCondition('A life?');
            expect(prereq).toBeInstanceOf(PersonTraitPrerequisite);
            const trait = prereq as PersonTraitPrerequisite;
            expect(trait.getRoleName()).toBe('A');
            expect(trait.getTraitName()).toBe('life');
            expect(trait.getSign()).toBe('positive');
        });

        test('should parse "B -magic" as negative trait condition', () => {
            const prereq = PrerequisiteParser.parseCondition('B -magic?');
            expect(prereq).toBeInstanceOf(PersonTraitPrerequisite);
            const trait = prereq as PersonTraitPrerequisite;
            expect(trait.getRoleName()).toBe('B');
            expect(trait.getTraitName()).toBe('magic');
            expect(trait.getSign()).toBe('negative');
        });

        test('should parse "A ~divinity" as tertiary trait condition', () => {
            const trait = PrerequisiteParser.parseCondition('A ~divinity?') as PersonTraitPrerequisite;
            expect(trait.getSign()).toBe('tertiary');
        });

        test('should not parse multi-word conditions that are not role + trait', () => {
            expect(PrerequisiteParser.parseCondition('foo bar')).toBeNull();
            expect(PrerequisiteParser.parseCondition('can fish')).not.toBeInstanceOf(PersonTraitPrerequisite);
        });
    });

    describe('evaluation', () => {
        test('isMet is false when the role has no person assigned', () => {
            const prereq = PrerequisiteParser.parseCondition('A life?') as PersonTraitPrerequisite;
            expect(prereq.isMet({ dataModel, getPersonForRole: () => undefined })).toBe(false);
        });

        test('isMet checks the assigned person for the requested trait sign', () => {
            const person = new Person('Person1');
            person.addNegativeTrait('magic');
            const context = { dataModel, getPersonForRole: (role: string) => role === 'A' ? person : undefined };

            expect((PrerequisiteParser.parseCondition('A magic?') as PersonTraitPrerequisite).isMet(context)).toBe(false);
            expect((PrerequisiteParser.parseCondition('A -magic?') as PersonTraitPrerequisite).isMet(context)).toBe(true);
        });
    });

    describe('in dialog text and choices', () => {
        test('<A life?a;b> substitutes based on the assigned person, (A magic?) filters choices', () => {
            makeCast();
            const event = parser.parseText(
                '*A: magic\n' +
                '§1\n' +
                'Pos: <A magic?has magic;no magic>\n' +
                'NegPos: <A life?has positive life;no positive life>\n' +
                'Neg: <A -life?has negative life;no negative life>\n' +
                'Tert: <A ~divinity?has tertiary divinity;no tertiary divinity>\n' +
                'Unassigned: <B life?B has life;B not assigned>\n' +
                '#2 (A magic?) Magic choice\n' +
                '#3 (A -magic?) Negative magic choice\n' +
                '#4 (A -life?) Negative life choice\n' +
                '#5 (B -magic?) Unassigned role choice\n' +
                '#999 Done\n' +
                '§2\nGood.\n#999 End\n' +
                '§999\nEnd.');

            const dialog = new Dialog(event, dataModel, callback);
            dialog.start();

            // Role A is assigned the cast member with positive magic
            expect(dialog.getPersonForRole('A')?.getName()).toBe('Person1');

            const text = dialog.getCurrentText();
            expect(text).toContain('Pos: has magic');
            expect(text).toContain('NegPos: no positive life');   // life is a negative trait
            expect(text).toContain('Neg: has negative life');
            expect(text).toContain('Tert: has tertiary divinity');
            expect(text).toContain('Unassigned: B not assigned'); // role B has no person

            const choices = dialog.getCurrentChoices().map(choice => choice.getText());
            expect(choices).toContain('Magic choice');
            expect(choices).not.toContain('Negative magic choice'); // magic is positive
            expect(choices).toContain('Negative life choice');
            expect(choices).not.toContain('Unassigned role choice');
        });

        test('person without the trait falls through to the else branch', () => {
            dataModel.addPerson(new Person('Plain'));
            const event = parser.parseText(
                '*A: scavenge\n§1\nT: <A magic?yes;no>\n#999 Done\n§999\nEnd.');
            const dialog = new Dialog(event, dataModel, callback);
            dialog.start();
            expect(dialog.getCurrentText()).toContain('T: no');
        });
    });
});
