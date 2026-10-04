import { EventParser } from '../src/classes/EventParser';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { Choice } from '../src/classes/Choice';
import { VarEffect } from '../src/classes/VarEffect';
import { BoolEffect } from '../src/classes/BoolEffect';
import { EventEffect } from '../src/classes/EventEffect';
import { Dialog } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';

describe('EventParser', () => {
    let parser: EventParser;
    let event: Event;
    
    beforeAll(() => {
        parser = new EventParser();
        const fs = require('fs');
        const fileContent = fs.readFileSync('test/texttest.txt', 'utf-8');
        event = parser.parseText(fileContent);
    });
    
    test('should return an Event instance', () => {
        expect(event).toBeInstanceOf(Event);
    });
    
    test('should contain 4 sections', () => {
        const sections = event.getSections();
        expect(sections.length).toBe(4);
    });
    
    test('first section should be number 1 and start with "Text 1 here"', () => {
        const sections = event.getSections();
        const firstSection = sections[0];
        expect(firstSection.getSectionNumber()).toBe(1);
        expect(firstSection.getText().startsWith('Text 1 here')).toBe(true);
    });
    
    test('first section should contain 2 choices with correct text pointing to sections 2 and 3', () => {
        const sections = event.getSections();
        const firstSection = sections[0];
        const choices = firstSection.getChoices();
        
        expect(choices.length).toBe(2);
        
        const choice1 = choices[0];
        const choice2 = choices[1];
        
        // Verify choice texts
        expect(choice1.getText()).toBe('Go to number 2');
        expect(choice2.getText()).toBe('Go to number 3');
        
        // Verify choice targets
        expect(choice1.getSection()).toBe(sections[1]); // Section 2
        expect(choice2.getSection()).toBe(sections[2]); // Section 3
    });
    
    test('section 2 should contain 2 effects', () => {
        const sections = event.getSections();
        const section2 = sections[1];
        const effects = section2.getEffects();

        expect(effects.length).toBe(2);
    });

    test('section 3 should contain 1 effect', () => {
        const sections = event.getSections();
        const section3 = sections[2];
        const effects = section3.getEffects();

        expect(effects.length).toBe(1);
    });
    
    test('section 4 should contain one choice with text "End" that ends the dialog', () => {
        const sections = event.getSections();
        const section4 = sections[3];
        const choices = section4.getChoices();
        
        // Section 4 should have one choice pointing to non-existent section 999
        expect(choices.length).toBe(1);
        
        const endChoice = choices[0];
        expect(endChoice.getText()).toBe('End');
        
        // The choice should not point to any valid section (dialog end)
        const targetSection = endChoice.getSection();
        expect(targetSection).toBeUndefined();
    });
    
    test('event should have starting section set to first section', () => {
        const sections = event.getSections();
        const startingSection = event.getStartingSection();

        expect(startingSection).toBe(sections[0]);
    });

    test('should complete dialog path via section 2', () => {
        const dm = new DataModel();
        const dlg = new Dialog(event, dm, {
            onDialogEnd: jest.fn(),
            onDialogUpdated: jest.fn()
        });

        dlg.start();
        expect(dlg.getCurrentText()).toContain('Text 1 here');

        const choices1 = dlg.getCurrentChoices();
        const goToSection2 = choices1.find((c: any) => c.getText() === 'Go to number 2');
        dlg.dialogChoiceSelected(goToSection2!);

        expect(dlg.getCurrentText()).toContain('Text 2 here');
        expect(dm.get('silver')).toBe(1);

        const choices2 = dlg.getCurrentChoices();
        const goToSection4 = choices2.find((c: any) => c.getText() === 'Continue');
        dlg.dialogChoiceSelected(goToSection4!);

        expect(dlg.getCurrentText()).toContain('Text 4 here');
        expect(dlg.getCurrentText()).toContain('1 silver');
    });

    test('should complete dialog path via section 3', () => {
        const dm = new DataModel();
        const dlg = new Dialog(event, dm, {
            onDialogEnd: jest.fn(),
            onDialogUpdated: jest.fn()
        });

        dlg.start();
        expect(dlg.getCurrentText()).toContain('Text 1 here');

        const choices1 = dlg.getCurrentChoices();
        const goToSection3 = choices1.find((c: any) => c.getText() === 'Go to number 3');
        dlg.dialogChoiceSelected(goToSection3!);

        expect(dlg.getCurrentText()).toContain('Text 3 here');
        expect(dm.isSet('hasDoneIt')).toBe(true);

        const choices2 = dlg.getCurrentChoices();
        const goToSection4 = choices2.find((c: any) => c.getText() === 'Continue');
        dlg.dialogChoiceSelected(goToSection4!);

        expect(dlg.getCurrentText()).toContain('Text 4 here');
        expect(dlg.getCurrentText()).toContain('and we have done it');
    });

    test('should ignore comment lines starting with //', () => {
        const parser = new EventParser();
        const text = `
// This is a comment
§1
// Another comment
Text with comment above
// Comment before choice
#2 Next section
// Comment at end
`;
        const event = parser.parseText(text);

        // Should have one section despite comments
        const sections = event.getSections();
        expect(sections.length).toBe(1);

        // Section 1 text should not contain comments
        const section1 = sections[0];
        expect(section1.getText()).toContain('Text with comment above');
        expect(section1.getText()).not.toContain('This is a comment');
        expect(section1.getText()).not.toContain('Another comment');

        // Should still have the choice
        const choices = section1.getChoices();
        expect(choices.length).toBe(1);
        expect(choices[0].getText()).toBe('Next section');
    });
});