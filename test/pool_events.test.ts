import { EventParser } from '../src/classes/EventParser';
import { GameLoop } from '../src/classes/GameLoop';
import { IGameUI } from '../src/classes/UI';

describe('Pool events: trigger mode parsing', () => {
    let parser: EventParser;

    beforeEach(() => {
        parser = new EventParser();
    });

    test('parses ?when and ?maybe with and without priority', () => {
        const when = parser.parseText('?when\n§1\nWatched event');
        expect(parser.getIssues().length).toBe(0);
        expect(when.getTrigger()).toBe('when');
        expect(when.getPriority()).toBe(0);

        const maybe = parser.parseText('?maybe 5\n§1\nFiller event');
        expect(parser.getIssues().length).toBe(0);
        expect(maybe.getTrigger()).toBe('maybe');
        expect(maybe.getPriority()).toBe(5);

        const prio = parser.parseText('?when -2\n§1\nUrgent');
        expect(parser.getIssues().length).toBe(0);
        expect(prio.getPriority()).toBe(-2);
    });

    test('event without a trigger line defaults to scheduled/0', () => {
        const event = parser.parseText('§1\nPlain event');
        expect(event.getTrigger()).toBe('scheduled');
        expect(event.getPriority()).toBe(0);
    });

    test('trigger mode combines with header conditions and role lines', () => {
        const event = parser.parseText('?when 3\n(weapons 1?)\n*A: scavenge\n§1\nWatched');
        expect(parser.getIssues().length).toBe(0);
        expect(event.getTrigger()).toBe('when');
        expect(event.getPriority()).toBe(3);
        expect(event.getPrerequisites().length).toBe(1);
        expect(event.getSections()[0].getPersonSelections().length).toBe(1);
    });

    test('reports an issue for an invalid trigger mode', () => {
        parser.parseText('?sometimes\n§1\nText');
        expect(parser.getIssues().some(i => i.message.includes('Invalid trigger mode'))).toBe(true);
    });

    test('reports an issue for a trigger mode after the first section', () => {
        parser.parseText('§1\n?when\nText');
        expect(parser.getIssues().some(i => i.message.includes('before the first section'))).toBe(true);
    });

    test('reports an issue for a duplicate trigger mode', () => {
        parser.parseText('?when\n?maybe\n§1\nText');
        expect(parser.getIssues().some(i => i.message.includes('Duplicate trigger mode'))).toBe(true);
    });
});

describe('Pool events: GameLoop firing', () => {
    let parser: EventParser;
    let gameLoop: GameLoop;
    let dataModel: any;
    const ui: IGameUI = { show: () => {} };

    beforeEach(() => {
        parser = new EventParser();
        gameLoop = new GameLoop(ui);
        dataModel = gameLoop.getDataModel();
        dataModel.set('currentDay', 1);
        dataModel.set('population', 5);
    });

    const currentText = (): string => gameLoop.getCurrentDialog()?.getCurrentText() ?? '';
    const register = (name: string, text: string, header = ''): void => {
        const event = parser.parseText(`${header}\n§1\n${text}`);
        expect(parser.getIssues().length).toBe(0);
        gameLoop.registerEvent(name, event);
        gameLoop.registerPoolEvent(name);
    };

    test('idle day with an empty queue fires a pool event', () => {
        register('foraging', 'Foraging event', '?when');
        gameLoop.next();
        // Day 1 had nothing scheduled: the pool event fired for today
        expect(currentText()).toContain('Foraging event');
        expect(gameLoop.getPool().length).toBe(0);
    });

    test('a pool event fires once and leaves the pool', () => {
        register('foraging', 'Foraging event', '?when');
        gameLoop.next();
        expect(gameLoop.getPool().length).toBe(0);
        gameLoop.endCurrentDialog();
        expect(gameLoop.getCurrentDialog()).toBeNull();
        expect(gameLoop.getEventQueue().length).toBe(0);
    });

    test('pool event with unmet prerequisites does not fire until met', () => {
        register('foraging', 'Foraging event', '?when\n(weapons 1?)');
        gameLoop.next();
        expect(gameLoop.getCurrentDialog()).toBeNull();

        dataModel.set('weapons', 1);
        gameLoop.next();
        expect(currentText()).toContain('Foraging event');
    });

    test('scheduled event due today preempts pool events', () => {
        register('foraging', 'Foraging event', '?when');
        const scheduled = parser.parseText('§1\nScheduled event');
        gameLoop.addEvent(scheduled, 1);
        gameLoop.next();
        expect(currentText()).toContain('Scheduled event');
        expect(gameLoop.getPool().length).toBe(1);
    });

    test('?when tier beats ?maybe tier', () => {
        register('filler', 'Filler event', '?maybe');
        register('watched', 'Watched event', '?when');
        gameLoop.next();
        expect(currentText()).toContain('Watched event');
        expect(gameLoop.getPool()).toEqual(['filler']);
    });

    test('priority orders candidates within a tier', () => {
        register('slow', 'Slow event', '?when 5');
        register('urgent', 'Urgent event', '?when 1');
        gameLoop.next();
        expect(currentText()).toContain('Urgent event');
        expect(gameLoop.getPool()).toEqual(['slow']);
    });

    test('only one pool event fires per idle day; second fires the next day', () => {
        register('first', 'First pool event', '?when 1');
        register('second', 'Second pool event', '?when 2');
        gameLoop.next();
        expect(currentText()).toContain('First pool event');
        expect(gameLoop.getPool()).toEqual(['second']);

        gameLoop.endCurrentDialog();
        // Day 2 is idle again, so the remaining pool event fires
        expect(currentText()).toContain('Second pool event');
        expect(gameLoop.getDataModel().getCurrentDay()).toBe(2);
    });

    test('pool event fills an idle day before a scheduled event', () => {
        register('foraging', 'Foraging event', '?when');
        const scheduled = parser.parseText('§1\nScheduled event');
        gameLoop.addEvent(scheduled, 2);
        gameLoop.next();
        // Day 1 is idle (scheduled event is due day 2): the pool event fires today
        expect(currentText()).toContain('Foraging event');
        expect(dataModel.getCurrentDay()).toBe(1);
        expect(gameLoop.getPool().length).toBe(0);
        gameLoop.endCurrentDialog();
        // After the pool event, day 2's scheduled event fires normally
        expect(currentText()).toContain('Scheduled event');
        expect(dataModel.getCurrentDay()).toBe(2);
    });

    test('empty queue and empty pool advances nothing', () => {
        gameLoop.next();
        expect(gameLoop.getCurrentDialog()).toBeNull();
        expect(dataModel.getCurrentDay()).toBe(1);
    });

    test('unfireable pool event with an empty queue stops advancing (guard)', () => {
        register('never', 'Never fires', '?when\n(weapons 1?)');
        gameLoop.next();
        expect(gameLoop.getCurrentDialog()).toBeNull();
        // Guard: no runaway day advancement while prerequisites stay unmet
        expect(dataModel.getCurrentDay()).toBeLessThan(370);
    });
});
