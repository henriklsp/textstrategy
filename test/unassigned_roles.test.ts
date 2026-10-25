import { Dialog } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { EventParser } from '../src/classes/EventParser';
import { Person } from '../src/classes/Person';

describe('Handling unassigned roles gracefully', () => {
    test('dialog with more roles than characters assigns only available roles', () => {
        const dataModel = new DataModel();
        
        // Add only 2 characters
        dataModel.addPerson(new Person('Alice', 'life', 'magic', 'divinity'));
        dataModel.addPerson(new Person('Bob', 'magic', 'life', 'divinity'));
        
        // Parse dialog with 4 roles but only 2 characters
        const parser = new EventParser();
        const event = parser.parseText(`
*A: divinity
*B: magic
*C: life
*D: harmony

§1
Hello <A>, <B>, <C>, and <D>.
#2 Continue

§2
Goodbye
#999 End

§999
End.
`);
        
        const mockCallback = {
            onDialogEnd: jest.fn(),
            onDialogUpdated: jest.fn()
        };
        
        const dialog = new Dialog(event, dataModel, mockCallback);
        dialog.start();
        
        const text = dialog.getCurrentText();
        
        // Roles C and D are unassigned, so their tags should be empty
        expect(text).toBe('Hello Alice, Bob, , and .');
        
        // Choices should still work
        const choices = dialog.getCurrentChoices();
        expect(choices.length).toBe(1);
        expect(choices[0].getText()).toBe('Continue');
    });

    test('choices with unassigned roles are hidden', () => {
        const dataModel = new DataModel();
        
        // Add only 1 character
        dataModel.addPerson(new Person('Alice', 'life', 'magic', 'divinity'));
        
        // Parse dialog with 2 roles but only 1 character
        const parser = new EventParser();
        const event = parser.parseText(`
*A: divinity
*B: magic

§1
Who to talk to?
#2 Talk to <A>
#3 Talk to <B>
#999 Done

§2
Talking to A
#1 Back
#999 End

§3
Talking to B
#1 Back
#999 End

§999
Done
`);
        
        const mockCallback = {
            onDialogEnd: jest.fn(),
            onDialogUpdated: jest.fn()
        };
        
        const dialog = new Dialog(event, dataModel, mockCallback);
        dialog.start();
        
        const choices = dialog.getCurrentChoices();
        const choiceTexts = choices.map(c => c.getText());
        
        // Choice with <A> should be visible (A is assigned)
        expect(choiceTexts).toContain('Talk to Alice');
        
        // Choice with <B> should be hidden (B is unassigned)
        expect(choiceTexts).not.toContain('Talk to <B>');
        expect(choiceTexts).not.toContain('Talk to B');
    });

    test('conditional text with unassigned role is empty', () => {
        const dataModel = new DataModel();
        
        // Add only 1 character
        dataModel.addPerson(new Person('Alice', 'life', 'magic', 'divinity'));
        
        // Parse dialog with 2 roles
        const parser = new EventParser();
        const event = parser.parseText(`
*A: divinity
*B: magic

§1
Check: <A life?yes;no> and <B magic?yes;no>
#999 Done

§999
Done
`);
        
        const mockCallback = {
            onDialogEnd: jest.fn(),
            onDialogUpdated: jest.fn()
        };
        
        const dialog = new Dialog(event, dataModel, mockCallback);
        dialog.start();
        
        const text = dialog.getCurrentText();
        
        // <A life?> should work (A is assigned)
        expect(text).toContain('Check: yes and ');
        
        // <B magic?> should be empty (B is unassigned)
        // The text should be "Check: yes and " with nothing after
        expect(text).not.toContain('no');
    });

    test('unassigned role tag returns empty string', () => {
        const dataModel = new DataModel();
        
        // Add only 1 character
        dataModel.addPerson(new Person('Alice', 'life', 'magic', 'divinity'));
        
        const parser = new EventParser();
        const event = parser.parseText(`
*A: divinity
*B: magic

§1
<A> is here, <B> is not
#999 Done

§999
Done
`);
        
        const mockCallback = {
            onDialogEnd: jest.fn(),
            onDialogUpdated: jest.fn()
        };
        
        const dialog = new Dialog(event, dataModel, mockCallback);
        dialog.start();
        
        const text = dialog.getCurrentText();
        
        // <A> should show Alice
        expect(text).toBe('Alice is here,  is not');
        
        // <B> should be empty
        expect(text).not.toContain('<B>');
    });
});
