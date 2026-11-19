import { Dialog } from '../src/classes/Dialog.ts';
import { DataModel } from '../src/classes/DataModel.ts';
import { Event } from '../src/classes/Event.ts';
import { Section } from '../src/classes/Section.ts';

// Mock callback for Dialog
const mockCallback = {
    onDialogEnd: jest.fn(),
    onDialogUpdated: jest.fn()
};

// <resource amount> renders a natural-language quantity phrase instead of a
// bare number, so prose can read "one basket of food" and "no weapons".
function render(text: string, dataModel: DataModel): string {
    const event = new Event([new Section(text)], new Section(text));
    const dialog = new Dialog(event, dataModel, mockCallback);
    dialog.start();
    return dialog.getCurrentText();
}

describe('amount substitution', () => {
    let dataModel: DataModel;

    beforeEach(() => {
        dataModel = new DataModel();
        jest.clearAllMocks();
    });

    test('zero resources read as "no ..." without the unit', () => {
        expect(render('You have <food amount>.', dataModel)).toBe('You have no food.');
        expect(render('You have <wood amount>.', dataModel)).toBe('You have no wood.');
        expect(render('You have <silver amount>.', dataModel)).toBe('You have no silver.');
        expect(render('You have <gold amount>.', dataModel)).toBe('You have no gold.');
        expect(render('You have <copper amount>.', dataModel)).toBe('You have no copper.');
        expect(render('You have <iron amount>.', dataModel)).toBe('You have no iron.');
        expect(render('You have <weapons amount>.', dataModel)).toBe('You have no weapons.');
        expect(render('You have <population amount>.', dataModel)).toBe('You have no people.');
    });

    test('one is spelled out, larger amounts are digits', () => {
        dataModel.set('food', 1);
        expect(render('<food amount>', dataModel)).toBe('one basket of food');
        dataModel.adjust('food', 1);
        expect(render('<food amount>', dataModel)).toBe('2 baskets of food');

        dataModel.set('wood', 1);
        expect(render('<wood amount>', dataModel)).toBe('one stack of wood');
        dataModel.adjust('wood', 1);
        expect(render('<wood amount>', dataModel)).toBe('2 stacks of wood');

        dataModel.set('silver', 1);
        expect(render('<silver amount>', dataModel)).toBe('one silver coin');
        dataModel.set('silver', 5);
        expect(render('<silver amount>', dataModel)).toBe('5 silver coins');
    });

    test('each resource has its unit', () => {
        dataModel.set('gold', 1);
        expect(render('<gold amount>', dataModel)).toBe('one golden trinket');
        dataModel.set('gold', 2);
        expect(render('<gold amount>', dataModel)).toBe('2 golden trinkets');
        dataModel.set('copper', 3);
        expect(render('<copper amount>', dataModel)).toBe('3 copper bars');
        dataModel.set('iron', 4);
        expect(render('<iron amount>', dataModel)).toBe('4 iron bars');
        dataModel.set('weapons', 2);
        expect(render('<weapons amount>', dataModel)).toBe('2 weapons');
        dataModel.set('population', 5);
        expect(render('<population amount>', dataModel)).toBe('5 people');
    });

    test('the phrase follows the live game state', () => {
        dataModel.set('food', 0);
        expect(render('<food amount>', dataModel)).toBe('no food');
        dataModel.adjust('food', 1);
        expect(render('<food amount>', dataModel)).toBe('one basket of food');
        dataModel.set('food', 10);
        expect(render('<food amount>', dataModel)).toBe('10 baskets of food');
    });

    test('the whole line reads as prose', () => {
        dataModel.set('food', 3);
        dataModel.set('silver', 1);
        expect(render('The count: <food amount>, <weapons amount>, <wood amount>, <silver amount>.', dataModel))
            .toBe('The count: 3 baskets of food, no weapons, no wood, one silver coin.');
    });

    test('non-resources leave the tag visible', () => {
        expect(render('Bounty: <bounty amount>', dataModel)).toBe('Bounty: <bounty amount>');
        expect(render('Made up: <unicorn amount>', dataModel)).toBe('Made up: <unicorn amount>');
    });
});
