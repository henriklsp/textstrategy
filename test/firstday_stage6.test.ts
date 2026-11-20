import * as path from 'path';
import { EventParser } from '../src/classes/EventParser.ts';
import { Dialog } from '../src/classes/Dialog.ts';
import { DataModel } from '../src/classes/DataModel.ts';
import { createDefaultCharacters } from '../src/classes/DefaultCharacters.ts';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };
type Scheduled = { name: string; delay: number };

// The day-1 starting state of Main.initialize(), with whatever the intro gave
function newDataModel(): DataModel {
    const dataModel = new DataModel();
    for (const person of createDefaultCharacters()) dataModel.addPerson(person);
    dataModel.setCurrentDay(1);
    dataModel.set('population', 5);
    dataModel.set('food', 1);
    dataModel.set('wood', 0);
    dataModel.setBounty(10);
    return dataModel;
}

// A dialog over one of the game's text files (the file must parse without issues)
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

function pickTo(dialog: Dialog, target: number): void {
    const choice = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === target);
    expect(choice).toBeDefined();
    dialog.dialogChoiceSelected(choice!);
}

// No unrendered tags or substitution errors may leak into the text
function expectClean(text: string): void {
    expect(text).not.toMatch(/<[A-Za-z!?]/);
}

describe("Stage 6: the intro's choices echo in firstday", () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    test('the planks salvage (intro §69) grants one wood and sets the planks bool', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startEvent('text/intro.txt', dataModel, scheduled);
        // Sleep path (rested): food grabbed at §61, second trip to §68, planks salvaged at §69
        for (const section of [39, 40, 50, 52, 59, 60, 61]) pickTo(dialog, section);
        pickTo(dialog, 68);
        pickTo(dialog, 69);
        expect(dataModel.isSet('planks')).toBe(true);
        expect(dataModel.get('wood')).toBe(1); // the salvaged deck planks are the day's first stack
        expect(dataModel.get('food')).toBe(3); // the §61 food sacks
        expect(dialog.getCurrentChoices().length).toBe(0);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
        expectClean(dialog.getCurrentText());
    });

    test('§1 renders differently per saved item: axe / oar / nothing are three different mornings', () => {
        const texts: string[] = [];
        for (const weapons of [0, 1, 2]) {
            const dataModel = newDataModel();
            dataModel.set('weapons', weapons);
            const dialog = startEvent('text/firstday.txt', dataModel, []);
            expectClean(dialog.getCurrentText());
            texts.push(dialog.getCurrentText());
        }
        expect(new Set(texts).size).toBe(3);
    });

    test("§20 knows whether you can meet the plank woman's price", () => {
        const texts: string[] = [];
        for (const silver of [0, 2]) {
            const dataModel = newDataModel();
            dataModel.set('silver', silver);
            const dialog = startEvent('text/firstday.txt', dataModel, []);
            pickTo(dialog, 20);
            expectClean(dialog.getCurrentText());
            texts.push(dialog.getCurrentText());
        }
        expect(texts[0]).not.toBe(texts[1]);
    });

    test('§10 knows the already-owned planks: planks path vs bare morning, different text', () => {
        const texts: string[] = [];
        for (const withPlanks of [true, false]) {
            const dataModel = newDataModel();
            if (withPlanks) {
                dataModel.set('planks', true);
                dataModel.set('wood', 1);
            }
            const dialog = startEvent('text/firstday.txt', dataModel, []);
            pickTo(dialog, 10);
            expectClean(dialog.getCurrentText());
            texts.push(dialog.getCurrentText());
        }
        expect(texts[0]).not.toBe(texts[1]);
        // The search always gains its one stack on top of whatever was carried ashore
    });

    test('the forage endings know the buried catch: §58 differs between a fed and a bare morning', () => {
        const texts: string[] = [];
        for (const food of [1, 3]) {
            const dataModel = newDataModel();
            dataModel.set('food', food);
            const dialog = startEvent('text/firstday.txt', dataModel, []);
            pickTo(dialog, 30); // make do: no wood gained, work focus follows
            pickTo(dialog, 40);
            pickTo(dialog, 50);
            pickTo(dialog, 58); // (wood 0) cut wood instead - a forage ending
            expectClean(dialog.getCurrentText());
            texts.push(dialog.getCurrentText());
        }
        expect(texts[0]).not.toBe(texts[1]);
    });
});
