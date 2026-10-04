import { DataModel } from '../src/classes/DataModel';
import { Dialog } from '../src/classes/Dialog';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { Choice } from '../src/classes/Choice';
import { Person } from '../src/classes/Person';
import { SetChoiceEffect } from '../src/classes/SetChoiceEffect';
import { AssignTaskEffect } from '../src/classes/AssignTaskEffect';
import { EventParser } from '../src/classes/EventParser';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };

describe('Choice Capture Mechanism', () => {
    test('SetChoiceEffect captures player choice into variable', () => {
        const dm = new DataModel();
        const s2 = new Section('Section 2');
        s2.setChoices([]);

        const s1 = new Section('Choose one:', [new SetChoiceEffect('task')], [
            new Choice('Forage', [], s2),
            new Choice('Hunt', [], s2)
        ]);

        const dialog = new Dialog(new Event([s1, s2], s1), dm, noop);
        dialog.start();

        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dialog.getChoiceVariable('task')).toBe('Forage');
    });

    test('Choice variables are reset when dialog starts', () => {
        const dm = new DataModel();
        const s1 = new Section('Test', [new SetChoiceEffect('task')], [
            new Choice('Forage', [], undefined)
        ]);

        const dialog = new Dialog(new Event([s1], s1), dm, noop);
        dialog.start();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dialog.getChoiceVariable('task')).toBe('Forage');

        dialog.start();
        expect(dialog.getChoiceVariable('task')).toBeUndefined();
    });

    test('Choice variables can be used in text with <variable> syntax', () => {
        const dm = new DataModel();
        const s2 = new Section('You will <task> now.', [new SetChoiceEffect('task')], [
            new Choice('Done', [], undefined)
        ]);

        const s1 = new Section('Choose:', [new SetChoiceEffect('task')], [
            new Choice('Forage', [], s2)
        ]);

        const dialog = new Dialog(new Event([s1, s2], s1), dm, noop);
        dialog.start();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);

        expect(dialog.getCurrentText()).toBe('You will Forage now.');
    });

    test('AssignTaskEffect with choice variables resolves person and task', () => {
        const dm = new DataModel();
        const alice = new Person('Alice', 'life', 'magic', 'harmony');
        dm.addPerson(alice);

        const s3 = new Section('Done', [new AssignTaskEffect('<person>', '<task>')], []);
        const s2 = new Section('Who?', [new SetChoiceEffect('person')], [
            new Choice('Alice', [], s3)
        ]);
        const s1 = new Section('Task?', [new SetChoiceEffect('task')], [
            new Choice('Hunt', [], s2)
        ]);

        const dialog = new Dialog(new Event([s1, s2, s3], s1), dm, noop);
        dialog.start();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);

        expect(dm.getTaskForPerson('Alice')).toBe('hunting');
    });

    test('Task name normalization accepts variations', () => {
        const dm = new DataModel();
        const alice = new Person('Alice', 'life', 'magic', 'harmony');
        dm.addPerson(alice);

        const testCases = ['hunt', 'Hunt', 'hunting', 'Hunting'];

        for (const taskText of testCases) {
            dm.assignPersonToTask('Alice', 'scavenge');
            const s2 = new Section('Done', [new AssignTaskEffect('<person>', '<task>')], []);
            const s1 = new Section('Task', [
                new SetChoiceEffect('task'),
                new SetChoiceEffect('person')
            ], [
                new Choice('Person', [], s2)
            ]);

            const dialog = new Dialog(new Event([s1, s2], s1), dm, noop);
            dialog.start();

            const choiceVars = dialog['choiceVariables'] as Map<string, string>;
            choiceVars.set('task', taskText);
            choiceVars.set('person', 'Alice');

            const effect = new AssignTaskEffect('<person>', '<task>');
            effect.takeEffect(dm, dialog);

            expect(dm.getTaskForPerson('Alice')).toBe('hunting');
        }
    });

    test('Error thrown when choice variable not set but used in effect', () => {
        const dm = new DataModel();
        const alice = new Person('Alice', 'life', 'magic', 'harmony');
        dm.addPerson(alice);

        const effect = new AssignTaskEffect('<person>', 'hunting');

        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: () => undefined
        };

        expect(() => {
            effect.takeEffect(dm, context as any);
        }).toThrow("Choice variable 'person' was never set");
    });

    test('Parsed [set task=choice] creates SetChoiceEffect', () => {
        const eventText = `
§1
[set task=choice]
#2 Forage
#2 Hunt

§2
You will <task>.
`;

        const parser = new EventParser();
        const event = parser.parseText(eventText);
        const dm = new DataModel();

        const dialog = new Dialog(event, dm, noop);
        dialog.start();

        const choices = dialog.getCurrentChoices();
        expect(choices.length).toBeGreaterThan(0);

        dialog.dialogChoiceSelected(choices[0]);

        const taskVar = dialog.getChoiceVariable('task');
        expect(['Forage', 'Hunt']).toContain(taskVar);
    });

    test('Error thrown for invalid task name', () => {
        const dm = new DataModel();
        const alice = new Person('Alice', 'life', 'magic', 'harmony');
        dm.addPerson(alice);

        const effect = new AssignTaskEffect('<person>', '<task>');

        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: (varName: string) => varName === 'person' ? 'Alice' : 'invalid_task'
        };

        expect(() => {
            effect.takeEffect(dm, context as any);
        }).toThrow('Invalid task name');
    });
});
