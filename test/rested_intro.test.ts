import * as path from 'path';
import { EventParser } from '../src/classes/EventParser';
import { Dialog } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { createDefaultCharacters } from '../src/classes/DefaultCharacters';
import { Person } from '../src/classes/Person';

// Tests for intro.txt as *engine input*: syntax validity (parse issues, no raw
// tags leaking into rendered text), state (bool effects), choice availability,
// and scheduled events. They deliberately do NOT assert on prose: the wording
// belongs to the text file and may change freely.

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };
type Scheduled = { name: string; delay: number };

function startIntro(dataModel: DataModel, scheduled: Scheduled[]): Dialog {
    const parser = new EventParser();
    const event = parser.parseFileSync(path.join(__dirname, '..', 'text', 'intro.txt'));
    expect(parser.getIssues()).toEqual([]);
    const dialog = new Dialog(event, dataModel, noop);
    dialog.setEffectScheduler((name, delay) => scheduled.push({ name, delay }));
    dialog.start();
    return dialog;
}

// Pick the choice leading to the given section number
function pickTo(dialog: Dialog, target: number): void {
    const choice = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === target);
    expect(choice).toBeDefined();
    dialog.dialogChoiceSelected(choice!);
}

function newDataModel(): DataModel {
    const dataModel = new DataModel();
    for (const person of createDefaultCharacters()) dataModel.addPerson(person);
    dataModel.setCurrentDay(1);
    dataModel.set('population', 5);
    dataModel.set('food', 10);
    dataModel.set('wood', 5);
    return dataModel;
}

// No unrendered tags or substitution errors may leak into the text
function expectClean(text: string): void {
    expect(text).not.toMatch(/<[A-Za-z!?]/);
}

// A run of the intro to its end: no choices left, firstday scheduled
function expectIntroEnded(dialog: Dialog, scheduled: Scheduled[]): void {
    expect(dialog.getCurrentChoices().length).toBe(0);
    expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
}

// Walk the common beach path (slept at §39, ashore at §52) to §64
function walkRestedTo64(dialog: Dialog): void {
    for (const section of [39, 40, 50, 52, 59, 60, 61, 64]) pickTo(dialog, section);
}

describe('intro.txt as engine input', () => {
    test('sleep path: sets the rested bool, offers the second trip at §61, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        pickTo(dialog, 39);
        expectClean(dialog.getCurrentText());
        pickTo(dialog, 40);
        pickTo(dialog, 50);
        pickTo(dialog, 52);
        expect(dataModel.isSet('rested')).toBe(true);
        expectClean(dialog.getCurrentText());
        pickTo(dialog, 59);
        pickTo(dialog, 60);
        pickTo(dialog, 61);
        expectClean(dialog.getCurrentText());
        // rested: the second trip (§68) is offered
        expect(dialog.getCurrentChoices().some(c => c.getSection()?.getSectionNumber() === 68)).toBe(true);
        pickTo(dialog, 68);
        expectClean(dialog.getCurrentText());
        pickTo(dialog, 69);
        expectClean(dialog.getCurrentText());
        expectIntroEnded(dialog, scheduled);
    });

    test('no-rest path: leaves rested unset, offers no second trip, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [5, 10, 11, 20, 21, 30, 31, 40, 50, 52]) pickTo(dialog, section);
        expect(dataModel.isSet('rested')).toBe(false);
        expectClean(dialog.getCurrentText());
        pickTo(dialog, 59);
        pickTo(dialog, 60);
        pickTo(dialog, 61);
        // unrested: no §68 choice
        expect(dialog.getCurrentChoices().some(c => c.getSection()?.getSectionNumber() === 68)).toBe(false);
        pickTo(dialog, 70);
        expectIntroEnded(dialog, scheduled);
    });

    test('§68 rendering depends on what was salvaged: broughtweapons state drives different text', () => {
        // Run A: axe grabbed at §63 -> broughtweapons set
        const dataModelA = newDataModel();
        const scheduledA: Scheduled[] = [];
        const dialogA = startIntro(dataModelA, scheduledA);
        for (const section of [39, 40, 50, 53, 54, 59, 60, 63, 68]) pickTo(dialogA, section);
        expect(dataModelA.isSet('broughtweapons')).toBe(true);
        const textA = dialogA.getCurrentText();

        // Run B: food grabbed at §61, no axe -> broughtweapons unset
        const dataModelB = newDataModel();
        const scheduledB: Scheduled[] = [];
        const dialogB = startIntro(dataModelB, scheduledB);
        for (const section of [39, 40, 50, 52, 59, 60, 61, 68]) pickTo(dialogB, section);
        expect(dataModelB.isSet('broughtweapons')).toBe(false);
        const textB = dialogB.getCurrentText();

        // both runs render cleanly but differently: the conditionals react to state
        expectClean(textA);
        expectClean(textB);
        expect(textA).not.toBe(textB);
    });

    test('§66 nested conditionals: no raw tags or errors leak on either item path', () => {
        for (const item of [61, 62]) {
            const dataModel = newDataModel();
            const scheduled: Scheduled[] = [];
            const dialog = startIntro(dataModel, scheduled);
            for (const section of [39, 40, 50, 52, 54, 59, 60, item, 64, 66]) pickTo(dialog, section);
            expectClean(dialog.getCurrentText());
            pickTo(dialog, 70);
            expectIntroEnded(dialog, scheduled);
        }
    });

    test('bow early path: wash ashore alone, unrested, no second trip, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [25, 28, 45, 46]) {
            pickTo(dialog, section);
            expectClean(dialog.getCurrentText());
        }
        expect(dataModel.isSet('rested')).toBe(false);
        pickTo(dialog, 59);
        pickTo(dialog, 60);
        pickTo(dialog, 61);
        expect(dialog.getCurrentChoices().some(c => c.getSection()?.getSectionNumber() === 68)).toBe(false);
        pickTo(dialog, 70);
        expectIntroEnded(dialog, scheduled);
    });

    test('bow after B talk: C joins, who-to-save choice, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [5, 10, 11, 20, 24, 26, 37, 45, 47, 53, 54, 59, 60, 62]) {
            pickTo(dialog, section);
            expectClean(dialog.getCurrentText());
        }
        pickTo(dialog, 70);
        expectIntroEnded(dialog, scheduled);
    });

    test('bow after C talk: keep watch alone, wash ashore, axe path, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [5, 10, 11, 20, 21, 30, 34, 35, 27, 45, 46, 59, 60, 63, 64]) {
            pickTo(dialog, section);
            expectClean(dialog.getCurrentText());
        }
        expect(dataModel.isSet('broughtweapons')).toBe(true);
        pickTo(dialog, 70);
        expectIntroEnded(dialog, scheduled);
    });

    test('rested player at the bow: second trip still offered, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [39, 40, 45, 47, 52, 54, 59, 60, 61]) {
            pickTo(dialog, section);
            expectClean(dialog.getCurrentText());
        }
        expect(dataModel.isSet('rested')).toBe(true);
        expect(dialog.getCurrentChoices().some(c => c.getSection()?.getSectionNumber() === 68)).toBe(true);
        pickTo(dialog, 68);
        pickTo(dialog, 69);
        expectIntroEnded(dialog, scheduled);
    });

    test('bow alone path: rejoin the survivors, ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [25, 28, 45, 46, 54, 59, 60, 61]) {
            pickTo(dialog, section);
            expectClean(dialog.getCurrentText());
        }
        pickTo(dialog, 70);
        expectIntroEnded(dialog, scheduled);
    });

    test('§66 sleep choice: ends the intro early, still scheduling firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [39, 40, 50, 52, 54, 59, 60, 61, 64, 66]) pickTo(dialog, section);
        expectClean(dialog.getCurrentText());
        pickTo(dialog, 71);
        expectClean(dialog.getCurrentText());
        expectIntroEnded(dialog, scheduled);
    });

    test('§59 offers wreck, surf and night choices; the surf path also ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        for (const section of [39, 40, 50, 52, 59]) pickTo(dialog, section);
        const choices = dialog.getCurrentChoices();
        expect(choices.length).toBe(3);
        expect(choices.some(c => c.getSection()?.getSectionNumber() === 60)).toBe(true);
        expect(choices.some(c => c.getSection()?.getSectionNumber() === 67)).toBe(true);
        expect(choices.some(c => c.getSection()?.getSectionNumber() === 70)).toBe(true);
        pickTo(dialog, 67);
        expectClean(dialog.getCurrentText());
        pickTo(dialog, 70);
        expectIntroEnded(dialog, scheduled);
    });

    test('§64 rendering depends on the assigned D trait branches', () => {
        // Deterministic casts: A/B/C are the only candidates for their roles
        // (positive divinity / negative life / positive magic), so D is forced.
        // D has the same name and gender in every cast, so any difference in
        // the rendered §64 comes from the variation tags, not from pronouns.
        const castFor = (d: Person): DataModel => {
            const dataModel = new DataModel();
            dataModel.addPerson(new Person('Asger', 'divinity', 'magic', 'harmony'));
            dataModel.addPerson(new Person('Bera', 'harmony', 'life', 'magic'));
            dataModel.addPerson(new Person('Cate', 'magic', 'divinity', 'life'));
            dataModel.addPerson(d);
            dataModel.setCurrentDay(1);
            dataModel.set('population', 5);
            dataModel.set('food', 10);
            dataModel.set('wood', 5);
            return dataModel;
        };
        const render64With = (d: Person): string => {
            const scheduled: Scheduled[] = [];
            const dialog = startIntro(castFor(d), scheduled);
            walkRestedTo64(dialog);
            const text = dialog.getCurrentText();
            expectClean(text);
            return text;
        };

        const neither = render64With(new Person('Dag'));                          // no traits at all
        const lifeOnly = render64With(new Person('Dag', 'life', 'magic', 'harmony'));    // positive life only
        const harmonyOnly = render64With(new Person('Dag', 'harmony', 'magic', 'divinity')); // positive harmony only

        // the life branch reacts to D's life trait
        expect(lifeOnly).not.toBe(neither);
        // likewise for harmony
        expect(harmonyOnly).not.toBe(neither);
        // and the two branches are independent
        expect(lifeOnly).not.toBe(harmonyOnly);
    });
});
