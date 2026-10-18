import { EventParser } from '../src/classes/EventParser';
import { GameLoop } from '../src/classes/GameLoop';
import { IGameUI } from '../src/classes/UI';

describe('Pool manifest parsing', () => {
    test('loads a manifest with unheaded events and priority sections', async () => {
        const gameLoop = new GameLoop({ show: () => {} });
        await gameLoop.loadPoolManifest('test/pool_manifest.txt');
        // foraging + rabbit: lowest priority; sickness: priority 1; storm: priority 2
        expect(gameLoop.getPool()).toEqual(['foraging', 'rabbit', 'sickness', 'storm']);
    });

    test('missing manifest registers nothing', async () => {
        const gameLoop = new GameLoop({ show: () => {} });
        await gameLoop.loadPoolManifest('test/no_such_manifest.txt');
        expect(gameLoop.getPool()).toEqual([]);
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
    const register = (name: string, text: string, header = '', tier?: number): void => {
        const event = parser.parseText(`${header}\n§1\n${text}`);
        expect(parser.getIssues().length).toBe(0);
        gameLoop.registerEvent(name, event);
        gameLoop.registerPoolEvent(name, tier);
    };

    test('idle day with an empty queue fires a pool event', () => {
        register('foraging', 'Foraging event');
        gameLoop.next();
        // Day 1 had nothing scheduled: the pool event fired for today
        expect(currentText()).toContain('Foraging event');
        expect(gameLoop.getPool().length).toBe(0);
    });

    test('a pool event fires once and leaves the pool', () => {
        register('foraging', 'Foraging event');
        gameLoop.next();
        expect(gameLoop.getPool().length).toBe(0);
        gameLoop.endCurrentDialog();
        expect(gameLoop.getCurrentDialog()).toBeNull();
        expect(gameLoop.getEventQueue().length).toBe(0);
    });

    test('pool event with unmet prerequisites does not fire until met', () => {
        register('foraging', 'Foraging event', '(weapons 1?)');
        gameLoop.next();
        expect(gameLoop.getCurrentDialog()).toBeNull();

        dataModel.set('weapons', 1);
        gameLoop.next();
        expect(currentText()).toContain('Foraging event');
    });

    test('scheduled event due today preempts pool events', () => {
        register('foraging', 'Foraging event');
        const scheduled = parser.parseText('§1\nScheduled event');
        gameLoop.addEvent(scheduled, 1);
        gameLoop.next();
        expect(currentText()).toContain('Scheduled event');
        expect(gameLoop.getPool().length).toBe(1);
    });

    test('priority 1 beats priority 2 and lowest priority', () => {
        register('low', 'Low event');
        register('urgent', 'Urgent event', '', 1);
        register('storm', 'Storm event', '', 2);
        gameLoop.next();
        expect(currentText()).toContain('Urgent event');
        expect(gameLoop.getPool().sort()).toEqual(['low', 'storm'].sort());
    });

    test('priority 2 beats lowest priority', () => {
        register('low', 'Low event');
        register('storm', 'Storm event', '', 2);
        gameLoop.next();
        expect(currentText()).toContain('Storm event');
        expect(gameLoop.getPool()).toEqual(['low']);
    });

    test('priority 1 with unmet conditions falls through to priority 2', () => {
        register('urgent', 'Urgent event', '(weapons 1?)', 1);
        register('storm', 'Storm event', '', 2);
        register('low', 'Low event');
        gameLoop.next();
        expect(currentText()).toContain('Storm event');
        expect(gameLoop.getPool().sort()).toEqual(['low', 'urgent'].sort());
    });

    test('only one pool event fires per idle day; second fires the next day', () => {
        register('first', 'First pool event', '', 1);
        register('second', 'Second pool event', '', 2);
        gameLoop.next();
        expect(currentText()).toContain('First pool event');
        expect(gameLoop.getPool()).toEqual(['second']);

        gameLoop.endCurrentDialog();
        // Day 2 is idle again, so the remaining pool event fires
        expect(currentText()).toContain('Second pool event');
        expect(gameLoop.getDataModel().getCurrentDay()).toBe(2);
    });

    test('pool event fills an idle day before a scheduled event', () => {
        register('foraging', 'Foraging event');
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
        register('never', 'Never fires', '(weapons 1?)');
        gameLoop.next();
        expect(gameLoop.getCurrentDialog()).toBeNull();
        // Guard: no runaway day advancement while prerequisites stay unmet
        expect(dataModel.getCurrentDay()).toBeLessThan(370);
    });
});
