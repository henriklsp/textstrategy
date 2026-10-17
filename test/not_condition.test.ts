import { EventParser } from '../src/classes/EventParser';
import { Dialog, DialogCallback } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { Person } from '../src/classes/Person';
import { PrerequisiteParser } from '../src/classes/PrerequisiteParser';

// The "not" prefix negates any condition, everywhere conditions are parsed:
// event header prerequisites, dialog choice conditions, and <cond?a;b> text.
describe('"not" condition negation', () => {
    let parser: EventParser;
    let dataModel: DataModel;
    let callback: DialogCallback;

    beforeEach(() => {
        parser = new EventParser();
        dataModel = new DataModel();
        callback = { onDialogEnd: jest.fn(), onDialogUpdated: jest.fn() };
    });

    describe('parseCondition', () => {
        const isMet = (condition: string, model: DataModel): boolean | null => {
            const prereq = PrerequisiteParser.parseCondition(condition);
            return prereq ? prereq.isMet({ dataModel: model, getPersonForRole: () => undefined }) : null;
        };

        test('(not flag) is met when the flag is unset, unmet when set', () => {
            expect(isMet('hasdoneit', dataModel)).toBe(false);
            expect(isMet('not hasdoneit', dataModel)).toBe(true);
            dataModel.set('hasdoneit', true);
            expect(isMet('not hasdoneit', dataModel)).toBe(false);
            expect(isMet('hasdoneit', dataModel)).toBe(true);
        });

        test('(not food 2) is met when food is below the threshold', () => {
            dataModel.set('food', 5);
            expect(isMet('not food 2', dataModel)).toBe(false);
            dataModel.set('food', 1);
            expect(isMet('not food 2', dataModel)).toBe(true);
        });

        test('not negates can-task conditions', () => {
            // can <task> needs a free worker, so give the model a cast
            const worker = new Person('Agnar');
            dataModel.addPerson(worker);
            expect(isMet('can scavenge', dataModel)).toBe(true);
            expect(isMet('not can scavenge', dataModel)).toBe(false);
            expect(isMet('can fish', dataModel)).toBe(false);
            expect(isMet('not can fish', dataModel)).toBe(true);
        });

        test('not negates person trait conditions (role unassigned: never met)', () => {
            const person = new Person('Aelar');
            person.addPositiveTrait('magic');
            dataModel.addPerson(person);
            expect(isMet('A magic', dataModel)).toBe(false); // no role assigned here
            expect(isMet('not A magic', dataModel)).toBe(true);
        });

        test('unrecognized negated condition still fails to parse; bare "not" is a flag', () => {
            expect(PrerequisiteParser.parseCondition('not !nonsense!')).toBeNull();
            // "not" alone is a truthy flag check (negation needs "not " + condition)
            const bare = PrerequisiteParser.parseCondition('not');
            expect(bare).not.toBeNull();
        });
    });

    test('event header: (not food 2) gates the event until food runs low', () => {
        const event = parser.parseText('(not food 2)\n§1\nShortage');
        expect(parser.getIssues().length).toBe(0);
        dataModel.set('food', 5);
        expect(event.arePrerequisitesMet(dataModel)).toBe(false);
        dataModel.set('food', 1);
        expect(event.arePrerequisitesMet(dataModel)).toBe(true);
    });

    test('dialog choices: (A magic) and (not A magic) are mutually exclusive', () => {
        const person = new Person('Aelar');
        person.addPositiveTrait('magic');
        dataModel.addPerson(person);
        const event = parser.parseText('*A: magic\n§1\nWho speaks?\n#2 (A magic) Mage path\n#3 (not A magic) Plain path\n§2\nChosen mage\n§3\nChosen plain');
        expect(parser.getIssues().length).toBe(0);

        const dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        const choices = dialog.getCurrentChoices().map(c => c.getText());
        expect(choices).toEqual(['Mage path']);
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dialog.getCurrentText()).toContain('Chosen mage');
    });

    test('text substitution: <not flag?a;b> picks the b branch when the flag is set', () => {
        const event = parser.parseText('§1\n<not hasdoneit?Not yet;Already done>');
        expect(parser.getIssues().length).toBe(0);
        let dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        expect(dialog.getCurrentText()).toContain('Not yet');
        dataModel.set('hasdoneit', true);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        expect(dialog.getCurrentText()).toContain('Already done');
    });
});
