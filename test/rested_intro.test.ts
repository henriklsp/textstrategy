import * as path from 'path';
import { EventParser } from '../src/classes/EventParser';
import { Dialog } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { createDefaultCharacters } from '../src/classes/DefaultCharacters';

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

describe('rested bool in intro.txt', () => {
    test('rested: §39 sets the bool, §52 renders the rested branch, §61 offers the second trip, §69 ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        // Sleep path
        pickTo(dialog, 39);
        expect(dialog.getCurrentText()).toContain('patient and small');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 40);
        pickTo(dialog, 50);
        pickTo(dialog, 52);
        expect(dialog.getCurrentText()).toContain('sleep the storm woke you from');
        expect(dialog.getCurrentText()).not.toContain('never slept');
        pickTo(dialog, 60);
        expect(dialog.getCurrentText()).toContain('every hour of it');
        pickTo(dialog, 61);
        // B is greatly impressed by the perfect theft
        expect(dialog.getCurrentText()).toContain('The perfect theft');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        // rested: the second trip is offered
        const secondTrip = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === 68);
        expect(secondTrip).toBeDefined();
        pickTo(dialog, 68);
        expect(dialog.getCurrentText()).toContain('Only a few deck planks remain');
        // nothing was salvaged: both conditional loss sentences render
        expect(dialog.getCurrentText()).toContain('three generations of iron given to the sea');
        expect(dialog.getCurrentText()).toContain("family's fortune is gone");
        pickTo(dialog, 69);
        expect(dialog.getCurrentText()).toContain('The wood is ashore');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        // ending section: no choices, firstday scheduled
        expect(dialog.getCurrentChoices().length).toBe(0);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });

    test('unrested: dialog path leaves rested unset, §52 renders the unrested branch, no second trip offered', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        // Full dialog path, no rest
        pickTo(dialog, 5);
        pickTo(dialog, 10);
        pickTo(dialog, 11);
        pickTo(dialog, 20);
        pickTo(dialog, 21);
        pickTo(dialog, 30);
        pickTo(dialog, 31);
        pickTo(dialog, 40);
        pickTo(dialog, 50);
        pickTo(dialog, 52);
        expect(dialog.getCurrentText()).toContain('drawn from somewhere empty');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 60);
        pickTo(dialog, 61);
        // unrested: no §68 choice
        const secondTrip = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === 68);
        expect(secondTrip).toBeUndefined();
        // the normal exits are still there
        pickTo(dialog, 70);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });

    test('§68 conditionals: axe already salvaged means no axe-lost sentence; §70 choice is relabeled', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);
        pickTo(dialog, 39);
        pickTo(dialog, 40);
        pickTo(dialog, 50);
        pickTo(dialog, 53);
        pickTo(dialog, 54);
        pickTo(dialog, 60);
        pickTo(dialog, 63); // grab the axe: broughtweapons true
        pickTo(dialog, 68);
        expect(dialog.getCurrentText()).toContain('Only a few deck planks remain');
        // the axe is safe on the beach: no axe-lost sentence
        expect(dialog.getCurrentText()).not.toContain('three generations of iron given to the sea');
        // the silver was not grabbed: the fortune-lost sentence still renders
        expect(dialog.getCurrentText()).toContain("family's fortune is gone");
        const back = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === 70);
        expect(back).toBeDefined();
        expect(back!.getText()).toContain('Return to shore');
    });
    test('§66 nested conditionals: no raw tags or errors leak into the rendered text', () => {
        for (const item of [61, 62]) {
            const dataModel = newDataModel();
            const scheduled: Scheduled[] = [];
            const dialog = startIntro(dataModel, scheduled);
            pickTo(dialog, 39);
            pickTo(dialog, 40);
            pickTo(dialog, 50);
            pickTo(dialog, 52);
            pickTo(dialog, 54);
            pickTo(dialog, 60);
            pickTo(dialog, item);
            pickTo(dialog, 64);
            pickTo(dialog, 66);
            const text = dialog.getCurrentText();
            expect(text).not.toContain('<food');
            expect(text).not.toContain('<ERROR');
            pickTo(dialog, 70);
        }
    });

    test('bow: early path - sunset at the bow, B joins, you spot the reef, the shout saves nothing', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        pickTo(dialog, 25);
        expect(dialog.getCurrentText()).toContain('straight off the bow');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 28);
        expect(dialog.getCurrentText()).toContain('quiet end of the boat');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 29);
        expect(dialog.getCurrentText()).toContain('The reef.');
        expect(dialog.getCurrentText()).toContain('The cry is yours to give');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 43);
        expect(dialog.getCurrentText()).toContain('BACK WATER');
        expect(dialog.getCurrentText()).toContain('Who do you grab and hold onto?');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 52);
        expect(dialog.getCurrentText()).toContain('the first order');
        pickTo(dialog, 54);
        pickTo(dialog, 60);
        pickTo(dialog, 61);
        // unrested: no second trip offered
        const secondTrip = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === 68);
        expect(secondTrip).toBeUndefined();
        expect(dialog.getCurrentText()).toContain('The perfect theft');
        pickTo(dialog, 70);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });

    test('bow: after B talk - C joins at the bow and hands you the watch; bracing, the wreck, firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        pickTo(dialog, 5);
        pickTo(dialog, 10);
        pickTo(dialog, 11);
        pickTo(dialog, 20);
        pickTo(dialog, 24);
        pickTo(dialog, 26);
        expect(dialog.getCurrentText()).toContain('You leave the benches');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 37);
        expect(dialog.getCurrentText()).toContain('Weed in the water today');
        expect(dialog.getCurrentText()).toContain('watch the water');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 29);
        pickTo(dialog, 44);
        expect(dialog.getCurrentText()).toContain('knowing is not saving');
        expect(dialog.getCurrentText()).toContain('Who do you grab and hold onto?');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 53);
        pickTo(dialog, 54);
        pickTo(dialog, 60);
        pickTo(dialog, 62);
        pickTo(dialog, 70);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });

    test('bow: after C talk - keep watch alone, shout, wreck; axe path still ends with firstday', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        pickTo(dialog, 5);
        pickTo(dialog, 10);
        pickTo(dialog, 11);
        pickTo(dialog, 20);
        pickTo(dialog, 21);
        pickTo(dialog, 30);
        pickTo(dialog, 34);
        pickTo(dialog, 35);
        pickTo(dialog, 27);
        expect(dialog.getCurrentText()).toContain('and the dark does not give it up');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 29);
        pickTo(dialog, 43);
        expect(dialog.getCurrentText()).toContain('The sea does not balance its books');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 51);
        pickTo(dialog, 54);
        pickTo(dialog, 60);
        pickTo(dialog, 63);
        pickTo(dialog, 64);
        pickTo(dialog, 70);
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });

    test('bow: rested player takes the bow as lookout from the storm build; second trip still offered', () => {
        const dataModel = newDataModel();
        const scheduled: Scheduled[] = [];
        const dialog = startIntro(dataModel, scheduled);

        pickTo(dialog, 39);
        pickTo(dialog, 40);
        pickTo(dialog, 29);
        expect(dialog.getCurrentText()).toContain('The cry is yours to give');
        expect(dialog.getCurrentText()).not.toContain('<ERROR');
        pickTo(dialog, 44);
        pickTo(dialog, 53);
        pickTo(dialog, 54);
        pickTo(dialog, 60);
        pickTo(dialog, 61);
        // rested: the second trip is offered even from the bow path
        const secondTrip = dialog.getCurrentChoices().find(c => c.getSection()?.getSectionNumber() === 68);
        expect(secondTrip).toBeDefined();
        pickTo(dialog, 68);
        pickTo(dialog, 69);
        expect(dialog.getCurrentText()).toContain('The wood is ashore');
        expect(scheduled).toContainEqual({ name: 'firstday', delay: 1 });
    });
});
