import * as fs from 'fs';
import * as path from 'path';
import { EventParser } from '../src/classes/EventParser';
import { Dialog } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { StartConstructionEffect } from '../src/classes/StartConstructionEffect';
import { createDefaultCharacters } from '../src/classes/DefaultCharacters';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };

type Scheduled = { name: string; delay: number };

// A data model with the default characters and the starting resources of Main.initialize()
function newDataModel(): DataModel {
    const dataModel = new DataModel();
    for (const person of createDefaultCharacters()) {
        dataModel.addPerson(person);
    }
    dataModel.setCurrentDay(1);
    dataModel.set('population', 5);
    dataModel.set('food', 10);
    dataModel.set('wood', 5);
    return dataModel;
}

// A dialog over one of the game's text files; scheduled events are recorded.
// The file must parse without issues.
function startEvent(file: string, dataModel: DataModel, scheduled: Scheduled[]): Dialog {
    const parser = new EventParser();
    const event = parser.parseFileSync(path.join(__dirname, '..', file));
    expect(parser.getIssues()).toEqual([]);
    expect(event.getSections().length).toBeGreaterThan(0);
    const dialog = new Dialog(event, dataModel, noop);
    dialog.setEffectScheduler((name, delay) => scheduled.push({ name, delay }));
    dialog.start();
    return dialog;
}

// Select the choice with the given (displayed) text
function pick(dialog: Dialog, text: string): void {
    const choice = dialog.getCurrentChoices().find(c => c.getText() === text);
    expect(choice).toBeDefined();
    dialog.dialogChoiceSelected(choice!);
}

// Follow the first available choice until a choice would end the dialog
function playThrough(dialog: Dialog): void {
    for (let i = 0; i < 20; i++) {
        const choices = dialog.getCurrentChoices();
        if (choices.length === 0) break;
        if (!choices[0].getSection()) break; // this choice ends the dialog
        dialog.dialogChoiceSelected(choices[0]);
    }
}

describe('Core loop wiring', () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    test('text/workinprogress content files parse without issues', () => {
        const wipDir = path.join(__dirname, '..', 'text', 'workinprogress');
        const files = fs.readdirSync(wipDir).filter(f => f.endsWith('.txt'));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const parser = new EventParser();
            const event = parser.parseText(fs.readFileSync(path.join(wipDir, file), 'utf-8'), file);
            expect(parser.getIssues()).toEqual([]);
            expect(event.getSections().length).toBeGreaterThan(0);
        }
    });

    test('the intro schedules the first day ashore', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/intro.txt', dataModel, scheduled);
        playThrough(dialog);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 0 });
    });

    test('firstday: order construction and assign a builder', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        expect(dataModel.get('wood')).toBe(7); // 5 starting + [var wood 2] in §1
        pick(dialog, 'Plan for the long term');
        pick(dialog, 'What should we build?');
        pick(dialog, 'Shelter');

        // §5: the shelter is under construction and paid for (1 wood)
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        expect(dataModel.get('wood')).toBe(6);

        // Pick the first candidate to lead the work
        const builder = dialog.getCurrentChoices()[0].getText();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);

        expect(dataModel.getTaskForPerson(builder)).toBe('build');
        expect(scheduled).toContainEqual({ name: 'workinprogress/foraging', delay: 1 });
    });

    test('firstday: focus on immediate needs instead of building', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        pick(dialog, 'Focus on immediate needs');
        // §3 assigns <C> and <D> to scavenging
        const scavenger = dialog.getPersonForRole('C')!.getName();
        expect(dataModel.getTaskForPerson(scavenger)).toBe('scavenge');
        expect(dataModel.getTaskForPerson(dialog.getPersonForRole('D')!.getName())).toBe('scavenge');

        pick(dialog, 'And what should we build?');
        pick(dialog, 'Build nothing yet. There is much else to do.');

        const forager = dialog.getCurrentChoices()[0].getText();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);

        expect(dataModel.getTaskForPerson(forager)).toBe('scavenge');
        expect(scheduled).toContainEqual({ name: 'workinprogress/foraging', delay: 1 });
    });

    test('council: order construction, assign a task, and adjourn', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/workinprogress/council.txt', dataModel, scheduled);

        pick(dialog, 'Order construction of a building');
        pick(dialog, 'Shelter');
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        expect(dataModel.get('wood')).toBe(4); // 5 - 1 for the shelter

        // Back to the reports; the build task is now available
        pick(dialog, 'Back to business');
        expect(dialog.getCurrentChoices().map(c => c.getText())).toContain('Building');

        pick(dialog, 'Scavenging');
        const forager = dialog.getCurrentChoices()[0].getText();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dataModel.getTaskForPerson(forager)).toBe('scavenge');

        // The council schedules its own next meeting before it adjourns
        expect(scheduled).toContainEqual({ name: 'workinprogress/council', delay: 10 });
    });
});

describe('[build <building>] choice variable', () => {
    test('parses and starts the captured building', () => {
        const parser = new EventParser();
        const event = parser.parseText(
            '§1\n[set building=choice]\nWhat shall we build?\n#2 Shelter\n#3 Hall\n§2\n[build <building>]\nSo be it.'
        );
        expect(parser.getIssues()).toEqual([]);

        const dataModel = newDataModel();
        const dialog = new Dialog(event, dataModel, noop);
        dialog.start();
        pick(dialog, 'Shelter');

        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        expect(dataModel.get('wood')).toBe(4);
    });

    test('StartConstructionEffect resolves choice variables case-insensitively', () => {
        const effect = new StartConstructionEffect('<building>');
        expect(effect.getBuildingType()).toBeNull();
        expect(effect.getBuildingRef()).toBe('<building>');

        // Without a captured choice the effect fails
        const dataModel = newDataModel();
        expect(() => effect.takeEffect(dataModel)).toThrow(/never set/);

        const context = {
            getPersonForRole: () => undefined,
            setPendingChoiceCapture: () => {},
            getChoiceVariable: (name: string) => (name === 'building' ? 'Shelter' : undefined),
        };
        effect.takeEffect(dataModel, context);
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
    });

    test('literals still work and invalid building types are rejected', () => {
        expect(new StartConstructionEffect('mine').getBuildingType()).toBe('mine');
        expect(() => new StartConstructionEffect('castle')).toThrow(/Invalid building type/);
    });
});
