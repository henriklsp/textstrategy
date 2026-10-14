import { EventParser } from '../src/classes/EventParser';
import { GameLoop, PoolTier } from '../src/classes/GameLoop';
import { IGameUI } from '../src/classes/UI';

describe('Pool events: manifest and registration', () => {
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
    const register = (name: string, text: string, header = '', tier: PoolTier = 'when'): void => {
        const event = parser.parseText(`${header}\n§1\n${text}`);
        expect(parser.getIssues().length).toBe(0);
        gameLoop.registerEvent(name, event);
        gameLoop.registerPoolEvent(name, tier);
    };

    test('a ?when line is no longer event syntax and is reported as ignored', () => {
        parser.parseText('?when\n§1\nWatched event');
        expect(parser.getIssues().some(i => i.message.includes('Ignored line before the first section'))).toBe(true);
    });

    test('header conditions still combine with role lines', () => {
        const event = parser.parseText('(weapons 1?)\n*A: scavenge\n§1\nWatched');
        expect(parser.getIssues().length).toBe(0);
        expect(event.getPrerequisites().length).toBe(1);
        expect(event.getSections()[0].getPersonSelections().length).toBe(1);
    });

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

    test('when tier beats maybe tier', () => {
        register('filler', 'Filler event', '', 'maybe');
        register('watched', 'Watched event', '', 'when');
        gameLoop.next();
        expect(currentText()).toContain('Watched event');
        expect(gameLoop.getPool()).toEqual([{ name: 'filler', tier: 'maybe' }]);
    });

    test('a maybe event fires when no when event can fire', () => {
        register('watched', 'Watched event', '(weapons 1?)', 'when');
        register('filler', 'Filler event', '', 'maybe');
        gameLoop.next();
        expect(currentText()).toContain('Filler event');
        expect(gameLoop.getPool()).toEqual([{ name: 'watched', tier: 'when' }]);
    });

    test('only one pool event fires per idle day; second fires the next day', () => {
        register('first', 'First pool event');
        register('second', 'Second pool event');
        gameLoop.next();
        expect(currentText()).toContain('First pool event');
        expect(gameLoop.getPool().length).toBe(1);

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

describe('Pool events: manifest file parsing', () => {
    let gameLoop: GameLoop;
    const ui: IGameUI = { show: () => {} };

    beforeEach(() => {
        gameLoop = new GameLoop(ui);
    });

    test('manifest entries register with their tier', async () => {
        const parser = new EventParser();
        const watched = parser.parseText('§1\nWatched');
        const filler = parser.parseText('§1\nFiller');
        gameLoop.registerEvent('watched', watched);
        gameLoop.registerEvent('filler', filler);

        const { writeFileSync, unlinkSync, mkdtempSync } = require('fs');
        const { join } = require('path');
        const os = require('os');
        const dir = mkdtempSync(join(os.tmpdir(), 'pool-'));
        const file = join(dir, 'pool.txt');
        writeFileSync(file, '// comment\n\nwhen watched\nmaybe filler\ninvalid line\n');
        try {
            await gameLoop.loadPoolManifest(file);
        } finally {
            unlinkSync(file);
        }

        expect(gameLoop.getPool()).toEqual([
            { name: 'watched', tier: 'when' },
            { name: 'filler', tier: 'maybe' }
        ]);
    });
});
