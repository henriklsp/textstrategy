import { Dialog } from '../src/classes/Dialog';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { Choice } from '../src/classes/Choice';
import { DataModel } from '../src/classes/DataModel';
import { VarEffect } from '../src/classes/VarEffect';
import { BoolEffect } from '../src/classes/BoolEffect';
import { EventEffect } from '../src/classes/EventEffect';
import { Prerequisite } from '../src/classes/Prerequisite';
import { EventParser } from '../src/classes/EventParser';

// Mock callback for Dialog
const createMockCallback = () => ({
    onDialogEnd: jest.fn(),
    onDialogUpdated: jest.fn()
});

describe('Dialog', () => {
    let dataModel: DataModel;
    let mockCallback: any;

    beforeEach(() => {
        dataModel = new DataModel();
        mockCallback = createMockCallback();
        jest.clearAllMocks();
    });

    describe('start()', () => {
        test('should start dialog at first section', () => {
            const section1 = new Section('Section 1 text');
            const section2 = new Section('Section 2 text');
            const event = new Event([section1, section2], section1);

            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('Section 1 text');
        });

        test('should handle dialog with no starting section', () => {
            const event = new Event([], null);

            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(mockCallback.onDialogEnd).toHaveBeenCalled();
            expect(dialog.getCurrentText()).toBe('');
        });
    });

    describe('getCurrentText()', () => {
        test('should return empty string when no current section', () => {
            const event = new Event([], null);
            const dialog = new Dialog(event, dataModel, mockCallback);

            expect(dialog.getCurrentText()).toBe('');
        });

        test('should return section text', () => {
            const section = new Section('Hello world');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('Hello world');
        });
    });

    describe('getCurrentChoices()', () => {
        test('should return empty array when no current section', () => {
            const event = new Event([], null);
            const dialog = new Dialog(event, dataModel, mockCallback);

            expect(dialog.getCurrentChoices()).toEqual([]);
        });

        test('should return all choices when no prerequisites', () => {
            const section2 = new Section('Section 2');
            const choice1 = new Choice('Choice A', [], section2);
            const choice2 = new Choice('Choice B', [], section2);
            const section1 = new Section('Section 1', [], [choice1, choice2]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            expect(choices.length).toBe(2);
            expect(choices[0].getText()).toBe('Choice A');
            expect(choices[1].getText()).toBe('Choice B');
        });

        test('should filter choices based on prerequisites', () => {
            const section2 = new Section('Section 2');
            
            // Create a prerequisite that is not met
            const prereq = new Prerequisite(() => false);
            const choice1 = new Choice('Choice A', [prereq], section2);
            const choice2 = new Choice('Choice B', [], section2);
            const section1 = new Section('Section 1', [], [choice1, choice2]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            expect(choices.length).toBe(1);
            expect(choices[0].getText()).toBe('Choice B');
        });
    });

    describe('dialogChoiceSelected()', () => {
        test('should do nothing when dialog is not active', () => {
            const section = new Section('Section 1');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            
            // Don't start the dialog
            const choice = new Choice('Test', [], section);
            dialog.dialogChoiceSelected(choice);

            expect(mockCallback.onDialogUpdated).not.toHaveBeenCalled();
        });

        test('should apply effects from current section when choice is selected', () => {
            const section2 = new Section('Section 2');
            const effect = new VarEffect('gold', 10);
            const choice = new Choice('Go to section 2', [], section2);
            const section1 = new Section('Section 1', [effect], [choice]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            dialog.dialogChoiceSelected(choice);

            expect(dataModel.get('gold')).toBe(10);
        });

        test('should navigate to target section', () => {
            const section2 = new Section('Section 2');
            const choice = new Choice('Go to section 2', [], section2);
            const section1 = new Section('Section 1', [], [choice]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('Section 1');
            
            dialog.dialogChoiceSelected(choice);

            expect(dialog.getCurrentText()).toBe('Section 2');
            expect(mockCallback.onDialogUpdated).toHaveBeenCalled();
        });

        test('should end dialog when choice has no target section', () => {
            const choice = new Choice('End dialog', [], undefined);
            const section1 = new Section('Section 1', [], [choice]);

            const event = new Event([section1], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            dialog.dialogChoiceSelected(choice);

            expect(mockCallback.onDialogEnd).toHaveBeenCalled();
        });

        test('section 999 is an ordinary section', () => {
            const section1 = new Section('Section 1');
            const section999 = new Section('Section 999', [], [new Choice('Back', [], section1)], [], 999);
            const choice = new Choice('Go', [], section999);
            section1.setChoices([choice]);

            const dialog = new Dialog(new Event([section1, section999], section1), dataModel, mockCallback);
            dialog.start();
            dialog.dialogChoiceSelected(choice);

            expect(mockCallback.onDialogEnd).not.toHaveBeenCalled();
            expect(dialog.getCurrentText()).toBe('Section 999');
            expect(dialog.getCurrentChoices().map(c => c.getText())).toEqual(['Back']);
        });

        test('a section without choices has no choices; endDialog ends the dialog', () => {
            const section2 = new Section('The end');
            const choice = new Choice('Go', [], section2);
            const section1 = new Section('Section 1', [], [choice]);

            const dialog = new Dialog(new Event([section1, section2], section1), dataModel, mockCallback);
            dialog.start();
            dialog.dialogChoiceSelected(choice);
            expect(dialog.getCurrentChoices()).toEqual([]);
            expect(mockCallback.onDialogEnd).not.toHaveBeenCalled();

            dialog.endDialog();
            expect(mockCallback.onDialogEnd).toHaveBeenCalledTimes(1);
            dialog.endDialog();
            expect(mockCallback.onDialogEnd).toHaveBeenCalledTimes(1);
        });

        test('should apply effects from new section after navigation', () => {
            const effect1 = new VarEffect('gold', 5);
            const effect2 = new VarEffect('gold', 10);
            const section2 = new Section('Section 2', [effect2]);
            const choice = new Choice('Go to section 2', [], section2);
            const section1 = new Section('Section 1', [effect1], [choice]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            dialog.dialogChoiceSelected(choice);

            // Both effects should have been applied
            expect(dataModel.get('gold')).toBe(15);
        });

        test('should apply boolean effects', () => {
            const effect = new BoolEffect('hasDoneIt', true);
            const section2 = new Section('Section 2');
            const choice = new Choice('Go to section 2', [], section2);
            const section1 = new Section('Section 1', [effect], [choice]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            dialog.dialogChoiceSelected(choice);

            expect(dataModel.isSet('hasDoneIt')).toBe(true);
        });

        test('should apply event effects', () => {
            const effect = new EventEffect('tempevent', 1);
            const section2 = new Section('Section 2');
            const choice = new Choice('Go to section 2', [], section2);
            const section1 = new Section('Section 1', [effect], [choice]);

            const event = new Event([section1, section2], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            dialog.dialogChoiceSelected(choice);

            // EventEffect triggers other events but doesn't modify DataModel directly
            // This just verifies the effect was applied without errors
            expect(mockCallback.onDialogUpdated).toHaveBeenCalled();
        });
    });

    describe('variable text processing', () => {
        test('should process random subsections', () => {
            const section = new Section('Text <?opt1;opt2> end');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            const result = dialog.getCurrentText();
            expect(['Text opt1 end', 'Text opt2 end']).toContain(result);
        });

        test('should process numeric variable display', () => {
            dataModel.adjust('gold', 42);
            const section = new Section('We have <gold?> gold');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('We have 42 gold');
        });

        test('should process boolean variable display', () => {
            dataModel.set('hasDoneIt', true);
            const section = new Section('Status: <hasDoneIt?>');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('Status: true');
        });

        test('should process conditional text', () => {
            dataModel.set('hasDoneIt', true);
            const section = new Section('We <hasDoneIt?have done it;have not done it>');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('We have done it');
        });

        test('should process multiple variable patterns in same text', () => {
            dataModel.adjust('silver', 5);
            dataModel.set('hasDoneIt', true);
            const section = new Section('We have <silver?> silver<hasDoneIt? and we have done it.; , but we have not done it.>');
            const event = new Event([section], section);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            expect(dialog.getCurrentText()).toBe('We have 5 silverand we have done it.');
        });
    });

    describe('Integration: full dialog flow', () => {
        test('should navigate through multiple sections with effects', () => {
            const effect1 = new VarEffect('gold', 10);
            const effect2 = new VarEffect('gold', 5);
            const section3 = new Section('End.');
            const choice2to3 = new Choice('Continue', [], section3);
            const section2 = new Section('You have <gold?> gold.', [effect2], [choice2to3]);
            const choice1to2 = new Choice('Continue', [], section2);
            const section1 = new Section('Start here.', [effect1], [choice1to2]);

            const event = new Event([section1, section2, section3], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            // Effects are now applied when entering a section, so section1 effects are applied on start
            expect(dialog.getCurrentText()).toBe('Start here.');
            expect(dataModel.get('gold')).toBe(10);

            // Navigate to section2 - applies section2 effects (+5)
            dialog.dialogChoiceSelected(choice1to2);
            expect(dialog.getCurrentText()).toBe('You have 15 gold.');
            expect(dataModel.get('gold')).toBe(15);

            // Navigate to section3 - no effects
            dialog.dialogChoiceSelected(choice2to3);
            expect(dialog.getCurrentText()).toBe('End.');
            expect(dataModel.get('gold')).toBe(15);
        });

        test('should handle boolean state changes across sections', () => {
            const effect1 = new BoolEffect('hasDoneIt', false);
            const section3 = new Section('Status: <hasDoneIt?>');
            const effect2 = new BoolEffect('hasDoneIt', true);
            const choice2to3 = new Choice('Continue', [], section3);
            const section2 = new Section('Status: <hasDoneIt?>', [effect2], [choice2to3]);
            const choice1to2 = new Choice('Continue', [], section2);
            const section1 = new Section('Start', [effect1], [choice1to2]);

            const event = new Event([section1, section2, section3], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            dialog.start();

            dialog.dialogChoiceSelected(choice1to2);
            expect(dialog.getCurrentText()).toBe('Status: true');

            dialog.dialogChoiceSelected(choice2to3);
            expect(dialog.getCurrentText()).toBe('Status: true');
        });

        test('should apply var effect precisely once per section entry', () => {
            const effect1 = new VarEffect('counter', 1);
            const section3 = new Section('End: counter is <counter?>');
            const effect2 = new VarEffect('counter', 1);
            const choice2to3 = new Choice('To section 3', [], section3);
            const section2 = new Section('Middle', [effect2], [choice2to3]);
            const choice1to2 = new Choice('To section 2', [], section2);
            const section1 = new Section('Start', [effect1], [choice1to2]);

            const event = new Event([section1, section2, section3], section1);
            const dialog = new Dialog(event, dataModel, mockCallback);
            
            // Starting section effects applied on start
            dialog.start();
            expect(dataModel.get('counter')).toBe(1);

            // Navigate to section 2 - applies section 2 effects once
            dialog.dialogChoiceSelected(choice1to2);
            expect(dataModel.get('counter')).toBe(2);

            // Navigate to section 3 - no effects
            dialog.dialogChoiceSelected(choice2to3);
            expect(dialog.getCurrentText()).toBe('End: counter is 2');
            expect(dataModel.get('counter')).toBe(2);
        });
    });

    describe('Choice prerequisites', () => {
        test('should hide choice with boolean prerequisite when not met', () => {
            // Create a fresh data model for this test
            const localDataModel = new DataModel();
            const parser = new EventParser();
            const event = parser.parseText(`
§1
Start
#2 Go to section 2
#2 (hasDoneIt?) Only visible if hasDoneIt
#999 End

§2
Section 2
#1 Back
#999 End

§999
End
`);
            
            const dialog = new Dialog(event, localDataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            expect(choices.length).toBe(2); // Only "Go to section 2" and "End"
            expect(choices.some(c => c.getText() === 'Go to section 2')).toBe(true);
            expect(choices.some(c => c.getText() === 'Only visible if hasDoneIt')).toBe(false);
        });

        test('should show choice with boolean prerequisite when met', () => {
            const localDataModel = new DataModel();
            localDataModel.set('hasDoneIt', true);
            
            const parser = new EventParser();
            const event = parser.parseText(`
§1
Start
#2 (hasDoneIt?) Only visible if hasDoneIt
#999 End

§2
Section 2
#1 Back
#999 End

§999
End
`);
            
            const dialog = new Dialog(event, localDataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            expect(choices.some(c => c.getText() === 'Only visible if hasDoneIt')).toBe(true);
        });

        test('should hide choice with numeric prerequisite when not met', () => {
            const localDataModel = new DataModel();
            localDataModel.adjust('gold', 0);
            
            const parser = new EventParser();
            const event = parser.parseText(`
§1
Start
#2 (gold 6?) Spend gold
#999 End

§2
Section 2
#1 Back
#999 End

§999
End
`);
            
            const dialog = new Dialog(event, localDataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            expect(choices.some(c => c.getText() === 'Spend gold')).toBe(false);
        });

        test('should show choice with numeric prerequisite when met', () => {
            const localDataModel = new DataModel();
            localDataModel.adjust('gold', 10);
            
            const parser = new EventParser();
            const event = parser.parseText(`
§1
Start
#2 (gold 6?) Spend gold
#999 End

§2
Section 2
#1 Back
#999 End

§999
End
`);
            
            const dialog = new Dialog(event, localDataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            expect(choices.some(c => c.getText() === 'Spend gold')).toBe(true);
        });

        test('should handle numeric prerequisites with space syntax', () => {
            const localDataModel = new DataModel();
            localDataModel.adjust('silver', 5);
            
            const parser = new EventParser();
            const event = parser.parseText(`
§1
Start
#2 (silver 5?) At least 5
#2 (silver?) Not zero
#999 End

§2
Section 2
#1 Back
#999 End

§999
End
`);
            
            const dialog = new Dialog(event, localDataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            const choiceTexts = choices.map(c => c.getText());
            
            expect(choiceTexts).toContain('At least 5');
            expect(choiceTexts).toContain('Not zero');
        });

        test('should replace person variables in choice text', () => {
            const localDataModel = new DataModel();
            // Add default characters
            const { defaultCharacters } = require('../src/classes/DefaultCharacters');
            for (const person of defaultCharacters) {
                localDataModel.addPerson(person);
            }
            
            const parser = new EventParser();
            const event = parser.parseText(`
*A: divinity, -magic
*B: life

§1
Talk to someone
#2 Talk to <A>
#2 Talk to <B>
#999 End

§2
Section 2
#1 Back
#999 End

§999
End
`);
            
            const dialog = new Dialog(event, localDataModel, mockCallback);
            dialog.start();

            const choices = dialog.getCurrentChoices();
            const choiceTexts = choices.map(c => c.getText());
            
            // Elrid has positive divinity and negative magic, matching *A: divinity, -magic
            // Agnar has positive life, matching *B: life
            expect(choiceTexts).toContain('Talk to Elrid');
            expect(choiceTexts).toContain('Talk to Agnar');
        });
    });
});
