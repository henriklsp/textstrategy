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
    dataModel.set('wood', 0);
    dataModel.setBounty(10);
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

// Follow the first choice that leads to a not-yet-visited section (falling
// back to the first choice when every choice has been visited already), until
// a choice would end the dialog or the walk is exhausted. The intro has
// loop-back choices, so a plain first-choice walk would never reach the end.
function playThrough(dialog: Dialog): void {
    const visited = new Set<number>();
    for (let i = 0; i < 40; i++) {
        const choices = dialog.getCurrentChoices();
        if (choices.length === 0) break;
        const fresh = choices.find(c => {
            const target = c.getSection();
            return target !== null && !visited.has(target.getSectionNumber()!);
        });
        const choice = fresh ?? choices[0];
        const target = choice.getSection();
        if (!target) break; // this choice ends the dialog
        visited.add(target.getSectionNumber()!);
        dialog.dialogChoiceSelected(choice);
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
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });

    test('firstday: searching the beach gains a stack of wood', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        expect(dataModel.get('wood')).toBe(0);
        pick(dialog, 'Search the beach for something useful');
        expect(dataModel.get('wood')).toBe(1);

        // The flow continues to the work focus
        pick(dialog, 'How should the work focus today?');
        expect(dialog.getCurrentChoices().map(c => c.getText()))
            .toEqual(['Focus on the short term: three forage, one builds', 'Focus on the long term: building first']);
    });

    test('firstday: the families sell planks for silver, and only for silver', () => {
        // Without silver, the offer cannot be taken
        const broke = newDataModel();
        const dialog = startEvent('text/firstday.txt', broke, []);
        pick(dialog, 'Ask the other families for help');
        expect(broke.get('silver')).toBe(0);
        expect(dialog.getCurrentChoices().map(c => c.getText()))
            .not.toContain('Buy the planks');
    });

    test('firstday: buying the planks trades silver for wood', () => {
        const dataModel = newDataModel();
        dataModel.set('silver', 2);
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        pick(dialog, 'Ask the other families for help');
        pick(dialog, 'Buy the planks');
        expect(dataModel.get('silver')).toBe(1);
        expect(dataModel.get('wood')).toBe(2);

        // The flow continues to the work focus
        pick(dialog, 'How should the work focus today?');
    });

    test('firstday: short term with wood - one builds, three forage', () => {
        const dataModel = newDataModel();
        dataModel.set('wood', 1);
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        pick(dialog, 'Make do with what we have');
        pick(dialog, 'How should the work focus today?');
        pick(dialog, 'Focus on the short term: three forage, one builds');
        pick(dialog, 'Shelter');

        // §51 ending: shelter under construction and paid for, one builder,
        // three foragers, the trip planned, no choices left
        expect(dialog.getCurrentChoices().length).toBe(0);
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        expect(dataModel.get('wood')).toBe(0);
        expect(dataModel.getPersonsForTask('build')).toHaveLength(1);
        expect(dataModel.getPersonsForTask('scavenge')).toHaveLength(3);
        // The life-trait friend always forages
        expect(dataModel.getPersonsForTask('scavenge'))
            .toContain(dialog.getPersonForRole('C')!.getName());
        expect(scheduled).toContainEqual({ name: 'workinprogress/foraging', delay: 1 });
    });

    test('firstday: short term without wood - one cuts wood instead', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        pick(dialog, 'Make do with what we have');
        pick(dialog, 'How should the work focus today?');
        pick(dialog, 'Focus on the short term: three forage, one builds');
        // No wood: nothing to build with, only cutting wood or nothing
        const labels = dialog.getCurrentChoices().map(c => c.getText());
        expect(labels).not.toContain('Shelter');
        expect(labels).toContain('Cut wood instead');
        pick(dialog, 'Cut wood instead');

        expect(dialog.getCurrentChoices().length).toBe(0);
        expect(dataModel.getPersonsForTask('woodcutting')).toHaveLength(1);
        expect(dataModel.getPersonsForTask('scavenge')).toHaveLength(3);
        expect(scheduled).toContainEqual({ name: 'workinprogress/foraging', delay: 1 });
    });

    test('firstday: long term - A and B build, D cuts wood, C forages', () => {
        const dataModel = newDataModel();
        dataModel.set('wood', 2);
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        pick(dialog, 'Make do with what we have');
        pick(dialog, 'How should the work focus today?');
        pick(dialog, 'Focus on the long term: building first');
        pick(dialog, 'Raft');
        pick(dialog, dialog.getPersonForRole('B')!.getName() + ' builds too');
        pick(dialog, dialog.getPersonForRole('D')!.getName() + ' cuts wood');

        // §64 ending: raft under construction (2 wood paid), two builders,
        // one woodcutter, one forager
        expect(dialog.getCurrentChoices().length).toBe(0);
        expect(dataModel.isBuildingUnderConstruction('raft')).toBe(true);
        expect(dataModel.get('wood')).toBe(0);
        expect(dataModel.getPersonsForTask('build')).toHaveLength(2);
        expect(dataModel.getPersonsForTask('woodcutting')).toHaveLength(1);
        expect(dataModel.getPersonsForTask('scavenge')).toHaveLength(1);
        expect(dataModel.getPersonsForTask('scavenge'))
            .toContain(dialog.getPersonForRole('C')!.getName());
        expect(scheduled).toContainEqual({ name: 'workinprogress/foraging', delay: 1 });
    });

    test('firstday: long term - A builds, B cuts wood, D forages', () => {
        const dataModel = newDataModel();
        dataModel.set('wood', 1);
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/firstday.txt', dataModel, scheduled);

        pick(dialog, 'Make do with what we have');
        pick(dialog, 'How should the work focus today?');
        pick(dialog, 'Focus on the long term: building first');
        pick(dialog, 'Shelter');
        pick(dialog, dialog.getPersonForRole('B')!.getName() + ' cuts wood');
        pick(dialog, dialog.getPersonForRole('D')!.getName() + ' forages');

        // §67 ending: shelter under construction (1 wood paid), one builder,
        // one woodcutter, two foragers
        expect(dialog.getCurrentChoices().length).toBe(0);
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        expect(dataModel.get('wood')).toBe(0);
        expect(dataModel.getPersonsForTask('build')).toHaveLength(1);
        expect(dataModel.getPersonsForTask('woodcutting')).toHaveLength(1);
        expect(dataModel.getPersonsForTask('scavenge')).toHaveLength(2);
        expect(dataModel.getPersonsForTask('scavenge'))
            .toContain(dialog.getPersonForRole('C')!.getName());
        expect(scheduled).toContainEqual({ name: 'workinprogress/foraging', delay: 1 });
    });

    test('firstday: the long term focus needs wood', () => {
        const dataModel = newDataModel();
        const dialog = startEvent('text/firstday.txt', dataModel, []);

        pick(dialog, 'Make do with what we have');
        pick(dialog, 'How should the work focus today?');
        // With no wood there is nothing to build, so only the short term is offered
        expect(dialog.getCurrentChoices().map(c => c.getText()))
            .toEqual(['Focus on the short term: three forage, one builds']);
    });

    test('council: order construction, assign a task, and adjourn', () => {
        const dataModel = newDataModel();
        // The council test needs wood to build with; the game starts with none
        dataModel.set('wood', 5);
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

        // The assignment returns to the agenda: several assignments per meeting
        pick(dialog, 'Back to business');
        expect(dialog.getCurrentChoices().map(c => c.getText())).toContain('Nothing. All is good.');

        // A second person can be assigned to the same meeting
        pick(dialog, 'Scavenging');
        const secondForager = dialog.getCurrentChoices()[0].getText();
        expect(secondForager).not.toBe(forager);
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dataModel.getTaskForPerson(secondForager)).toBe('scavenge');
        pick(dialog, 'Back to business');

        // The council schedules its next meeting only when it adjourns
        pick(dialog, 'Nothing. All is good.');
        expect(scheduled).toContainEqual({ name: 'workinprogress/council', delay: 10 });
        expect(scheduled.filter(s => s.name === 'workinprogress/council')).toHaveLength(1);
        pick(dialog, 'Council adjourned.');
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
        dataModel.set('wood', 5); // the [build] effect needs wood; the game itself starts with none
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
        dataModel.set('wood', 5);
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
