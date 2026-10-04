import { EventParser } from '../src/classes/EventParser';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { Person } from '../src/classes/Person';
import { PersonSelection } from '../src/classes/PersonSelection';
import { DataModel } from '../src/classes/DataModel';
import { Dialog, DialogCallback } from '../src/classes/Dialog';

describe('texttest2 - Person Selection in Dialog', () => {
    let parser: EventParser;
    let event: Event;
    let dataModel: DataModel;
    let dialog: Dialog;
    let onDialogEnd: jest.Mock;
    let onDialogUpdated: jest.Mock;

    // Create mock callback
    let callback: DialogCallback;

    beforeAll(() => {
        parser = new EventParser();
        const fs = require('fs');
        const fileContent = fs.readFileSync('test/texttest2.txt', 'utf-8');
        event = parser.parseText(fileContent);
    });

    beforeEach(() => {
        dataModel = new DataModel();
        onDialogEnd = jest.fn();
        onDialogUpdated = jest.fn();
        callback = { onDialogEnd, onDialogUpdated };
    });

    test('should parse texttest2.txt and create sections with person selections', () => {
        expect(event).toBeInstanceOf(Event);
        const sections = event.getSections();
        expect(sections.length).toBe(2);
        const firstSection = sections[0];
        expect(firstSection.getPersonSelections().length).toBe(2);
    });

    test('Dialog should replace <A> and <B> with selected Person names', () => {
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('life');
        person1.addTertiaryTrait('divinity');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addPositiveTrait('harmony');
        person2.addTertiaryTrait('life');
        const person3 = new Person('Person3');
        person3.addTertiaryTrait('magic');
        person3.addPositiveTrait('life');
        person3.addNegativeTrait('divinity');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dataModel.addPerson(person3);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        const currentText = dialog.getCurrentText();
        expect(currentText).toContain('Person3');
        expect(currentText).toContain('Person2');
        expect(currentText).toMatch(/Person3 says 'Hi'.*\n'Hello', replies Person2/);
    });

    test('Dialog should assign different Persons to different roles', () => {
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('life');
        person1.addTertiaryTrait('divinity');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addPositiveTrait('harmony');
        person2.addTertiaryTrait('life');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        const roleA = dialog.getPersonForRole('A');
        const roleB = dialog.getPersonForRole('B');
        expect(roleA).toBeDefined();
        expect(roleB).toBeDefined();
        expect(roleA).not.toBe(roleB);
        expect(roleA?.getName()).not.toBe(roleB?.getName());
    });

    test('Dialog should prefer perfect trait matches over tertiary matches', () => {
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('life');
        const person2 = new Person('Person2');
        person2.addTertiaryTrait('magic');
        person2.addPositiveTrait('life');
        const person3 = new Person('Person3');
        person3.addNegativeTrait('magic');
        person3.addPositiveTrait('harmony');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dataModel.addPerson(person3);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        const currentText = dialog.getCurrentText();
        expect(currentText).toContain('Person1');
        expect(currentText).toContain('Person3');
        expect(currentText).not.toContain('Person2');
    });

    test('Dialog should use tertiary matches when no perfect matches exist', () => {
        const person1 = new Person('Person1');
        person1.addTertiaryTrait('magic');
        person1.addNegativeTrait('life');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addPositiveTrait('harmony');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        const currentText = dialog.getCurrentText();
        expect(currentText).toContain('Person1');
        expect(currentText).toContain('Person2');
    });

    test('Dialog should avoid mismatched traits when better options exist', () => {
        const personA = new Person('PersonA');
        personA.addPositiveTrait('magic');
        personA.addNegativeTrait('life');
        const personB = new Person('PersonB');
        personB.addNegativeTrait('magic');
        personB.addPositiveTrait('harmony');
        const personC = new Person('PersonC');
        personC.addNegativeTrait('magic');
        personC.addPositiveTrait('harmony');
        dataModel.addPerson(personA);
        dataModel.addPerson(personB);
        dataModel.addPerson(personC);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        const currentText = dialog.getCurrentText();
        expect(currentText).toContain('PersonA');
        const roleBName = currentText.match(/replies (\w+)\./)?.[1];
        expect(roleBName).toBeDefined();
        const assignedB = dataModel.getCast().find(p => p.getName() === roleBName);
        expect(assignedB).toBeDefined();
        expect(assignedB?.hasNegativeTrait('magic')).toBe(true);
        expect(currentText).not.toMatch(/PersonB says 'Hi'/);
    });

    test('Dialog navigation to section 2 should re-resolve PersonSelections', () => {
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('life');
        person1.addTertiaryTrait('divinity');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addPositiveTrait('harmony');
        person2.addTertiaryTrait('life');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dialog = new Dialog(event, dataModel, callback);
        dialog.start();
        let currentText = dialog.getCurrentText();
        expect(currentText).toContain('Person1');
        expect(currentText).toContain('Person2');
        const choices = dialog.getCurrentChoices();
        const goToSection2 = choices.find(c => c.getText() === 'Go to number 2');
        expect(goToSection2).toBeDefined();
        dialog.dialogChoiceSelected(goToSection2!);
        currentText = dialog.getCurrentText();
        expect(currentText).toBe('Abcdefg.');
    });

    test('first section should have correct text before substitution', () => {
        const sections = event.getSections();
        const firstSection = sections[0];
        const text = firstSection.getText();
        expect(text).toContain('<A>');
        expect(text).toContain('<B>');
        expect(text).toContain("says 'Hi'");
        expect(text).toContain("'Hello', replies");
    });

    test('Dialog should assign each role to a different person even with many roles', () => {
        const selectionA = PersonSelection.createSingle('A', 'magic', false);
        const selectionB = PersonSelection.createSingle('B', 'magic', true);
        const selectionC = PersonSelection.createSingle('C', 'divinity', false);
        const sectionWithThreeRoles = new Section('Test', [], [], [selectionA, selectionB, selectionC], 99);
        const testEvent = new Event([sectionWithThreeRoles], sectionWithThreeRoles);
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addPositiveTrait('divinity');
        person1.addNegativeTrait('life');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addNegativeTrait('divinity');
        person2.addPositiveTrait('life');
        const person3 = new Person('Person3');
        person3.addTertiaryTrait('magic');
        person3.addTertiaryTrait('divinity');
        person3.addPositiveTrait('life');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dataModel.addPerson(person3);
        dialog = new Dialog(testEvent, dataModel, callback);
        dialog.start();
        const roleA = dialog.getPersonForRole('A');
        const roleB = dialog.getPersonForRole('B');
        const roleC = dialog.getPersonForRole('C');
        expect(roleA).toBeDefined();
        expect(roleB).toBeDefined();
        expect(roleC).toBeDefined();
        expect(roleA).not.toBe(roleB);
        expect(roleA).not.toBe(roleC);
        expect(roleB).not.toBe(roleC);
        const names = [roleA?.getName(), roleB?.getName(), roleC?.getName()];
        expect(new Set(names).size).toBe(3);
    });

    test('Dialog should make sensible assignments with complex trait combinations', () => {
        const selectionA = PersonSelection.createSingle('A', 'magic', false);
        const selectionB = PersonSelection.createSingle('B', 'divinity', false);
        const sectionWithTwoRoles = new Section('Test', [], [], [selectionA, selectionB], 99);
        const testEvent = new Event([sectionWithTwoRoles], sectionWithTwoRoles);
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('divinity');
        person1.addNegativeTrait('life');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addPositiveTrait('divinity');
        person2.addPositiveTrait('life');
        const person3 = new Person('Person3');
        person3.addTertiaryTrait('magic');
        person3.addTertiaryTrait('divinity');
        person3.addPositiveTrait('life');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dataModel.addPerson(person3);
        dialog = new Dialog(testEvent, dataModel, callback);
        dialog.start();
        const roleA = dialog.getPersonForRole('A');
        const roleB = dialog.getPersonForRole('B');
        expect(roleA?.getName()).toBe('Person1');
        expect(roleB?.getName()).toBe('Person2');
    });

    test('Dialog should handle cases where Person has no relevant traits', () => {
        const selectionA = PersonSelection.createSingle('A', 'magic', false);
        const selectionB = PersonSelection.createSingle('B', 'magic', true);
        const sectionWithTwoRoles = new Section('Test', [], [], [selectionA, selectionB], 99);
        const testEvent = new Event([sectionWithTwoRoles], sectionWithTwoRoles);
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('life');
        person1.addTertiaryTrait('divinity');
        const person2 = new Person('Person2');
        person2.addPositiveTrait('divinity');
        person2.addNegativeTrait('life');
        person2.addTertiaryTrait('harmony');
        const person3 = new Person('Person3');
        person3.addNegativeTrait('magic');
        person3.addPositiveTrait('harmony');
        person3.addTertiaryTrait('life');
        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dataModel.addPerson(person3);
        dialog = new Dialog(testEvent, dataModel, callback);
        dialog.start();
        const roleA = dialog.getPersonForRole('A');
        const roleB = dialog.getPersonForRole('B');
        expect(roleA?.getName()).toBe('Person1');
        expect(roleB?.getName()).toBe('Person3');
        expect(roleA?.getName()).not.toBe('Person2');
        expect(roleB?.getName()).not.toBe('Person2');
    });

    test('assigns roles based on trait matching', () => {
        // Create Persons with specific trait combinations
        const personA = new Person('PersonA');
        personA.addPositiveTrait('life');
        personA.addNegativeTrait('magic');

        const personB = new Person('PersonB');
        personB.addPositiveTrait('harmony');
        personB.addNegativeTrait('life');

        dataModel.addPerson(personA);
        dataModel.addPerson(personB);

        dialog = new Dialog(event, dataModel, callback);
        dialog.start();

        // Verify that two different people were assigned to the two roles
        const roleA = dialog.getPersonForRole('A');
        const roleB = dialog.getPersonForRole('B');
        expect(roleA).toBeDefined();
        expect(roleB).toBeDefined();
        expect(roleA?.getName()).not.toBe(roleB?.getName());
    });

    test('person selections persist across sections', () => {
        // Create fresh DataModel with test characters
        const localDataModel = new DataModel();
        const person1 = new Person('TestPerson');
        person1.addPositiveTrait('divinity');
        localDataModel.addPerson(person1);

        // Parse text with PersonSelection in section 1 and reference in section 2
        const localParser = new EventParser();
        const localEvent = localParser.parseText(`
*A: divinity

§1
Section 1. Person A is <A>.
#2 Go to section 2

§2
Section 2. Person A is <A>.
#999 End

§999
End
`);

        dialog = new Dialog(localEvent, localDataModel, callback);
        dialog.start();

        const section1Text = dialog.getCurrentText();
        const section1Person = dialog.getPersonForRole('A');
        expect(section1Text).toContain(section1Person!.getName());

        // Navigate to section 2 - should still show same person for role A
        const choices = dialog.getCurrentChoices();
        const goToSection2 = choices.find(c => c.getText() === 'Go to section 2');
        dialog.dialogChoiceSelected(goToSection2!);

        const section2Person = dialog.getPersonForRole('A');
        expect(section2Person).toBe(section1Person);
    });

    test('Person selections can be overridden in later sections', () => {
        // Create fresh DataModel with specific persons
        const localDataModel = new DataModel();

        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        localDataModel.addPerson(person1);

        const person2 = new Person('Person2');
        person2.addPositiveTrait('life');
        localDataModel.addPerson(person2);

        // Parse text with different PersonSelections in each section
        const localParser = new EventParser();
        const localEvent = localParser.parseText(`
*A: magic

§1
Section 1. Person A is <A>.
#2 Go to section 2

§2
*A: life
Section 2. Person A is now <A>.
#1 Back
#999 End

§999
End
`);

        dialog = new Dialog(localEvent, localDataModel, callback);
        dialog.start();

        const section1Text = dialog.getCurrentText();
        expect(section1Text).toContain('Person1');

        // Navigate to section 2 - role A should now be Person2
        const choices = dialog.getCurrentChoices();
        const goToSection2 = choices.find(c => c.getText() === 'Go to section 2');
        expect(goToSection2).toBeDefined();
        dialog.dialogChoiceSelected(goToSection2!);

        const section2Text = dialog.getCurrentText();
        expect(section2Text).toContain('Person2');
    });

    test('should complete full dialog from start to end', () => {
        const person1 = new Person('Person1');
        person1.addPositiveTrait('magic');
        person1.addNegativeTrait('life');
        person1.addTertiaryTrait('divinity');
        const person2 = new Person('Person2');
        person2.addNegativeTrait('magic');
        person2.addPositiveTrait('harmony');
        person2.addTertiaryTrait('life');

        dataModel.addPerson(person1);
        dataModel.addPerson(person2);
        dialog = new Dialog(event, dataModel, callback);

        // Start dialog
        dialog.start();
        expect(dialog.getCurrentText()).toContain('Person1');
        expect(dialog.getCurrentText()).toContain('Person2');

        // Navigate to section 2
        const choices = dialog.getCurrentChoices();
        const goToSection2 = choices.find(c => c.getText() === 'Go to number 2');
        expect(goToSection2).toBeDefined();

        dialog.dialogChoiceSelected(goToSection2!);

        // Verify we reached section 2 (the final section in texttest2.txt)
        expect(dialog.getCurrentText()).toBe('Abcdefg.');
        expect(callback.onDialogEnd).not.toHaveBeenCalled(); // Dialog not ended yet
    });
});
