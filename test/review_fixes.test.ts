import { DataModel } from '../src/classes/DataModel';
import { Dialog } from '../src/classes/Dialog';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { Choice } from '../src/classes/Choice';
import { Person } from '../src/classes/Person';
import { PersonSelection } from '../src/classes/PersonSelection';
import { AssignTaskEffect } from '../src/classes/AssignTaskEffect';
import { EventParser } from '../src/classes/EventParser';
import { GameLoop } from '../src/classes/GameLoop';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Resources are clamped at 0', () => {
    test('adjust cannot take a resource below 0', () => {
        const dm = new DataModel();
        dm.set('food', 3);
        dm.adjust('food', -10);
        expect(dm.get('food')).toBe(0);
    });

    test('set cannot put a resource below 0', () => {
        const dm = new DataModel();
        dm.set('silver', -4);
        expect(dm.get('silver')).toBe(0);
    });

    test('daily consumption stops at 0 food', () => {
        const dm = new DataModel();
        dm.set('population', 5);
        dm.set('food', 2);
        dm.updateDailyResources();
        dm.updateDailyResources();
        expect(dm.get('food')).toBe(0);
    });

    test('non-resource variables may still go negative', () => {
        const dm = new DataModel();
        dm.adjust('reputation', -2);
        expect(dm.get('reputation')).toBe(-2);
    });
});

describe('AssignTaskEffect assigns the person who has the role', () => {
    test('role A is resolved to the selected person', () => {
        const dm = new DataModel();
        const hunter = new Person('Hunter', 'life', 'magic', 'harmony');
        const other = new Person('Other', 'magic', 'life', 'harmony');
        dm.addPerson(other);
        dm.addPerson(hunter);
        const section = new Section('Go hunt', [new AssignTaskEffect('A', 'hunting')], [],
            [PersonSelection.createSingle('A', 'life')], 1);
        const dialog = new Dialog(new Event([section], section), dm, noop);
        dialog.start();
        expect(dialog.getPersonForRole('A')?.getName()).toBe('Hunter');
        expect(dm.getTaskForPerson('Hunter')).toBe('hunting');
        expect(dm.getTaskForPerson('A')).toBeNull();
    });

    test('parsed [task A fishing] works end to end', () => {
        const dm = new DataModel();
        dm.addPerson(new Person('Fisher', 'life', 'magic', 'harmony'));
        const event = new EventParser().parseText('*A: life\n§1\n[task A fishing]\nText');
        new Dialog(event, dm, noop).start();
        expect(dm.getPersonsForTask('fishing')).toEqual(['Fisher']);
    });

    test('unresolved role throws and assigns nothing', () => {
        const dm = new DataModel();
        expect(() => new AssignTaskEffect('Z', 'mining').takeEffect(dm)).toThrow(/No person assigned to role 'Z'/);
        expect(dm.getTaskAssignments()).toEqual([]);
    });
});

describe('Random subsections are picked once per section entry', () => {
    test('re-rendering keeps the same text', () => {
        const section = new Section('<?a;b;c;d;e;f;g;h> <?1;2;3;4;5;6;7;8>', [], [], [], 1);
        const dialog = new Dialog(new Event([section], section), new DataModel(), noop);
        dialog.start();
        const first = dialog.getCurrentText();
        for (let i = 0; i < 20; i++) {
            expect(dialog.getCurrentText()).toBe(first);
        }
    });

    test('re-entering the section picks again', () => {
        const random = jest.spyOn(Math, 'random');
        const s2 = new Section('<?x;y>', [], [], [], 2);
        const back = new Choice('back', [], s2);
        s2.setChoices([back]);
        const s1 = new Section('start', [], [new Choice('go', [], s2)], [], 1);
        const dialog = new Dialog(new Event([s1, s2], s1), new DataModel(), noop);
        dialog.start();
        random.mockReturnValue(0.1);
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dialog.getCurrentText()).toBe('x');
        random.mockReturnValue(0.9);
        expect(dialog.getCurrentText()).toBe('x');
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dialog.getCurrentText()).toBe('y');
    });
});

describe('Event queue triggers events on the correct day', () => {
    const makeEvent = (label: string) => {
        const s = new Section(label, [], [new Choice('end', [], undefined)], [], 1);
        return new Event([s], s);
    };
    const currentText = (g: GameLoop) => g.getCurrentDialog()?.getCurrentText();
    const endDialog = (g: GameLoop) => g.dialogChoiceSelected(g.getCurrentDialog()!.getCurrentChoices()[0]);

    test('events run on their scheduled day, in day order', () => {
        const g = new GameLoop();
        g.getDataModel().setCurrentDay(1);
        g.addEvent(makeEvent('today'));
        g.scheduleEvent(makeEvent('in three days'), 3);
        g.scheduleEvent(makeEvent('in one day'), 1);
        expect(g.getEventQueue().map(e => e.day)).toEqual([1, 2, 4]);

        g.next();
        expect(currentText(g)).toBe('today');
        endDialog(g);
        expect(g.getDataModel().getCurrentDay()).toBe(2);
        expect(currentText(g)).toBe('in one day');
        endDialog(g);
        expect(g.getDataModel().getCurrentDay()).toBe(4);
        expect(currentText(g)).toBe('in three days');
    });

    test('events due on the same day run without advancing the day', () => {
        const g = new GameLoop();
        g.getDataModel().setCurrentDay(5);
        g.addEvent(makeEvent('first'));
        g.addEvent(makeEvent('second'));
        g.next();
        endDialog(g);
        expect(g.getDataModel().getCurrentDay()).toBe(5);
        expect(currentText(g)).toBe('second');
    });

    test('next() does not start an event scheduled in the future', () => {
        const g = new GameLoop();
        g.getDataModel().setCurrentDay(1);
        g.scheduleEvent(makeEvent('later'), 2);
        g.next();
        expect(g.getCurrentDialog()).toBeNull();
    });

    test('[event name n] schedules the named event on current day + n', () => {
        const g = new GameLoop();
        g.getDataModel().setCurrentDay(3);
        g.registerEvent('visitor', makeEvent('visitor arrives'));
        const intro = g.getParser().parseText('§1\n[event visitor 2]\nHello\n#999 End\n§999\nBye');
        g.addEvent(intro);
        g.next();
        expect(g.getEventQueue().map(e => e.day)).toEqual([5]);
        endDialog(g);
        // §999 is an ordinary section without choices: the player moves on with Continue
        expect(currentText(g)).toBe('Bye');
        g.endCurrentDialog();
        expect(g.getDataModel().getCurrentDay()).toBe(5);
        expect(currentText(g)).toBe('visitor arrives');
    });
});
