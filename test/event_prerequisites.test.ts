import { EventParser } from '../src/classes/EventParser';
import { Event } from '../src/classes/Event';
import { DataModel } from '../src/classes/DataModel';
import { GameLoop } from '../src/classes/GameLoop';
import { IGameUI } from '../src/classes/UI';
import { Person } from '../src/classes/Person';

describe('Event prerequisites (header conditions)', () => {
    let parser: EventParser;
    let dataModel: DataModel;

    beforeEach(() => {
        parser = new EventParser();
        dataModel = new DataModel();
    });

    test('parses a header condition into event prerequisites', () => {
        const event = parser.parseText('(weapons 1?)\n§1\nText here');
        expect(event.getPrerequisites().length).toBe(1);
        expect(parser.getIssues().length).toBe(0);
    });

    test('parses several header conditions that must all be met', () => {
        const event = parser.parseText('(weapons 1?)\n(can scavenge)\n(boil)\n§1\nText here');
        expect(event.getPrerequisites().length).toBe(3);
        expect(parser.getIssues().length).toBe(0);
    });

    test('event without header conditions has no prerequisites', () => {
        const event = parser.parseText('§1\nText here');
        expect(event.getPrerequisites().length).toBe(0);
    });

    test('reports an issue for an invalid header condition', () => {
        const event = parser.parseText('(not a condition)\n§1\nText here');
        expect(event.getPrerequisites().length).toBe(0);
        expect(parser.getIssues().some(i => i.message.includes('Invalid event condition'))).toBe(true);
    });

    test('reports an issue for a condition after the first section', () => {
        parser.parseText('§1\n(weapons 1?)\nText here');
        expect(parser.getIssues().some(i => i.message.includes('must be in the header'))).toBe(true);
    });

    test('header conditions work alongside role selections', () => {
        const event = parser.parseText('(weapons 1?)\n*A: scavenge\n§1\nText here');
        expect(event.getPrerequisites().length).toBe(1);
        expect(parser.getIssues().length).toBe(0);
        expect(event.getSections()[0].getPersonSelections().length).toBe(1);
    });

    describe('arePrerequisitesMet', () => {
        test('flag condition: met only when the flag is set', () => {
            const event = parser.parseText('(broughtweapons?)\n§1\nText here');
            expect(event.arePrerequisitesMet(dataModel)).toBe(false);
            dataModel.set('broughtweapons', true);
            expect(event.arePrerequisitesMet(dataModel)).toBe(true);
        });

        test('numeric condition: space syntax means >=', () => {
            const event = parser.parseText('(weapons 1?)\n§1\nText here');
            expect(event.arePrerequisitesMet(dataModel)).toBe(false);
            dataModel.set('weapons', 1);
            expect(event.arePrerequisitesMet(dataModel)).toBe(true);
        });

        test('can task condition', () => {
            const event = parser.parseText('(can scavenge)\n§1\nText here');
            expect(event.arePrerequisitesMet(dataModel)).toBe(true);
            const fishing = parser.parseText('(can fish)\n§1\nText here');
            expect(fishing.arePrerequisitesMet(dataModel)).toBe(false);
        });

        test('several conditions must all be met', () => {
            const event = parser.parseText('(weapons 1?)\n(boil)\n§1\nText here');
            dataModel.set('weapons', 2);
            expect(event.arePrerequisitesMet(dataModel)).toBe(false);
            dataModel.set('boil', true);
            expect(event.arePrerequisitesMet(dataModel)).toBe(true);
        });

        test('person trait conditions are never met for events', () => {
            const event = parser.parseText('(A life?)\n§1\nText here');
            dataModel.addPerson(new Person('Agnar', 'life', 'divinity', 'harmony', 'male'));
            expect(event.arePrerequisitesMet(dataModel)).toBe(false);
        });
    });
});

describe('GameLoop event prerequisite requeueing', () => {
    let parser: EventParser;
    let gameLoop: GameLoop;
    let dataModel: DataModel;
    const ui: IGameUI = { show: () => {} };

    beforeEach(() => {
        parser = new EventParser();
        gameLoop = new GameLoop(ui);
        dataModel = gameLoop.getDataModel();
        dataModel.set('currentDay', 1);
    });

    const currentText = (): string => gameLoop.getCurrentDialog()?.getCurrentText() ?? '';

    test('due event with unmet prerequisites is moved to the next free day', () => {
        const gate = parser.parseText('(weapons 1?)\n§1\nGate event');
        const other = parser.parseText('§1\nOther event');
        const second = parser.parseText('§1\nSecond event');
        gameLoop.addEvent(gate, 1);
        gameLoop.addEvent(other, 1);
        gameLoop.addEvent(second, 2);

        gameLoop.next();

        // Gate was due today with weapons 0: skipped, and the other due-today event started
        expect(currentText()).toContain('Other event');
        // Gate moved past day 2 (occupied by second) to day 3
        const queue = gameLoop.getEventQueue();
        expect(queue.some(e => e.day === 3)).toBe(true);
        expect(queue.find(e => e.day === 3)?.event?.getStartingSection()?.getText()).toContain('Gate event');
    });

    test('requeued event starts once its prerequisites are met', () => {
        const gate = parser.parseText('(weapons 1?)\n§1\nGate event');
        const filler = parser.parseText('§1\nFiller event');
        gameLoop.addEvent(gate, 1);
        gameLoop.addEvent(filler, 1);

        gameLoop.next();
        // Gate skipped (weapons 0, moved to day 2), filler started instead
        expect(currentText()).toContain('Filler event');
        expect(gameLoop.getEventQueue()[0].day).toBe(2);

        // Meet the condition, end the dialog: the game advances to day 2 and the gate event starts
        dataModel.set('weapons', 1);
        gameLoop.endCurrentDialog();
        expect(currentText()).toContain('Gate event');
        expect(gameLoop.getEventQueue().length).toBe(0);
    });

    test('events without prerequisites start as before', () => {
        const plain = parser.parseText('§1\nPlain event');
        gameLoop.addEvent(plain, 1);
        gameLoop.next();
        expect(currentText()).toContain('Plain event');
        expect(gameLoop.getEventQueue().length).toBe(0);
    });
});
