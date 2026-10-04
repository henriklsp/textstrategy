import { EventParser } from '../src/classes/EventParser';
import { Dialog } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';

// Mock callback for Dialog
const mockCallback = {
    onDialogEnd: jest.fn(),
    onDialogUpdated: jest.fn()
};

describe('Variable Subsection Processing', () => {
    let dataModel: DataModel;
    let parser: EventParser;

    beforeEach(() => {
        dataModel = new DataModel();
        parser = new EventParser();
        jest.clearAllMocks();
    });

    describe('Random subsection selection', () => {
        test('should randomly select one of multiple subsections in <?opt1;opt2;opt3>', () => {
            const text = 'Hello <?option A;option B;option C> world';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            
            // Result should contain exactly one of the options
            expect(['Hello option A world', 'Hello option B world', 'Hello option C world'])
                .toContain(result);
        });

        test('should handle subsection with spaces', () => {
            const text = 'Text <?subsection A.; subsection B.>';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            
            expect(['Text subsection A.', 'Text subsection B.']).toContain(result);
        });
    });

    describe('Variable value display', () => {
        test('should display numeric variable value for <silver?>', () => {
            dataModel.adjust('silver', 42);
            const text = 'We have <silver?> silver';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We have 42 silver');
        });

        test('should display 0 for unset numeric variable', () => {
            // silver is a known variable that defaults to 0
            const text = 'We have <silver?> silver';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We have 0 silver');
        });

        test('should display boolean variable state', () => {
            dataModel.set('hasDoneIt', true);
            const text = 'Status: <hasDoneIt?>';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('Status: true');
        });
    });

    describe('Conditional text', () => {
        test('should display first text when boolean is true for <var? trueText; falseText>', () => {
            dataModel.set('hasDoneIt', true);
            const text = 'We <hasDoneIt?and we have done it.;, but we have not done it.>';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We and we have done it.');
        });

        test('should display second text when boolean is false', () => {
            dataModel.set('hasDoneIt', false);
            const text = 'We <hasDoneIt?and we have done it.;, but we have not done it.>';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We , but we have not done it.');
        });

        test('should handle numeric variable conditionally', () => {
            dataModel.adjust('silver', 10);
            const text = 'We have <silver?> silver';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We have 10 silver');
        });
    });

    describe('Combined patterns', () => {
        test('should handle multiple patterns in same text', () => {
            dataModel.adjust('silver', 5);
            dataModel.set('hasDoneIt', true);
            // Note: The conditional text has a leading space to produce proper spacing
            const text = 'We have <silver?> silver<hasDoneIt? and we have done it.; , but we have not done it.>';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            
            expect(result).toBe('We have 5 silverand we have done it.');
        });

        test('should handle patterns from actual text file', () => {
            dataModel.adjust('silver', 0);
            dataModel.set('hasDoneIt', false);
            
            const event = parser.parseText('§1\nText 4 here. We have <silver?> silver<hasDoneIt? and we have done it.; , but we have not done it.>\n#999 End');
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            // Options are trimmed, so the leading space in " , but we have not done it." is removed
            expect(result).toBe('Text 4 here. We have 0 silver, but we have not done it.');
        });

        test('should handle random subsection with variable text', () => {
            dataModel.adjust('silver', 100);
            const text = 'You found <?a chest with gold;a pile of silver> containing <silver?> coins';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            
            // Should contain one of the random options and the variable value
            expect(result.includes('100 coins')).toBe(true);
            expect(result.includes('a chest with gold') || result.includes('a pile of silver')).toBe(true);
        });

        test('should handle numeric conditional with space syntax <food 3?plenty;little>', () => {
            dataModel.adjust('food', 2);
            const text = 'We have <food 3?plenty;little> food';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We have little food');
        });

        test('should handle numeric conditional true case', () => {
            dataModel.adjust('food', 5);
            const text = 'We have <food 3?plenty;little> food';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('We have plenty food');
        });

        test('should handle numeric conditional with zero threshold', () => {
            dataModel.adjust('gold', 0);
            const text = 'Gold: <gold 0?some;none>';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('Gold: some');
        });

        test('should display simple variable value with <var> syntax', () => {
            dataModel.adjust('food', 5);
            const text = 'You have <food> food';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('You have 5 food');
        });

        test('should handle combined simple var and conditional', () => {
            dataModel.adjust('food', 2);
            const text = 'You have <food> sack<food 2?s;> of food';
            const event = new Event([new Section(text)], new Section(text));
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(result).toBe('You have 2 sacks of food');
        });
    });
});
