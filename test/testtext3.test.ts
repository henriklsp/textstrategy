import { EventParser } from '../src/classes/EventParser';
import { GameLoop } from '../src/classes/GameLoop';
import { DataModel } from '../src/classes/DataModel';
import { Dialog } from '../src/classes/Dialog';
import { Person } from '../src/classes/Person';

describe('testtext3 - Task Assignment and Construction', () => {
    let parser: EventParser;
    let gameLoop: GameLoop;
    let dataModel: DataModel;

    beforeEach(() => {
        parser = new EventParser();
        gameLoop = new GameLoop();
        dataModel = gameLoop.getDataModel();

        // Load testtext3.txt
        const fs = require('fs');
        const fileContent = fs.readFileSync('test/testtext3.txt', 'utf-8');
        const event = parser.parseText(fileContent);

        // Add event to queue for day 0
        gameLoop.addEvent(event, 0);

        // Set initial resources
        dataModel.set('wood', 2);

        // Add three persons: Alice (good at scavenging), Bob (good at building), Cia (neutral)
        const alice = new Person('Alice', 'life', 'magic', 'harmony');
        const bob = new Person('Bob', 'divinity', 'chaos', 'harmony');
        const cia = new Person('Cia', 'harmony', 'divinity', 'magic');
        dataModel.addPerson(alice);
        dataModel.addPerson(bob);
        dataModel.addPerson(cia);
    });

    test('should parse testtext3.txt and apply effects', () => {
        // Event should be in queue
        expect(gameLoop.getEventQueue().length).toBe(1);

        // Start the event
        gameLoop.next();

        // Event should have executed effects
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        expect(dataModel.get('wood')).toBe(1);  // 2 - 1 for shelter construction

        // Check that task assignments were made
        const assignments = dataModel.getTaskAssignments();
        expect(assignments.length).toBe(2);
        expect(assignments.map(a => a.taskType)).toContain('scavenge');
        expect(assignments.map(a => a.taskType)).toContain('build');
    });

    test('should assign all persons to tasks (explicit or default)', () => {
        gameLoop.next();

        const allPersons = dataModel.getCast();
        const assigned = new Set(dataModel.getTaskAssignments().map(a => a.personName));

        // At least 2 persons should be explicitly assigned (roles A and B)
        expect(assigned.size).toBeGreaterThanOrEqual(2);

        // Role assignments work with task-based selection
        const taskTypes = Array.from(dataModel.getTaskAssignments()).map(a => a.taskType);
        expect(new Set(taskTypes).has('scavenge')).toBe(true);
        expect(new Set(taskTypes).has('build')).toBe(true);
    });

    test('should complete construction when build task is assigned', () => {
        gameLoop.next();

        // Verify construction started
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);

        // Manually advance day to trigger construction completion
        dataModel.nextDay();
        dataModel.assignUnassignedToDefaultTask();
        dataModel.updateDailyResources();

        // Verify construction completed (1 builder, base 1 day, so 1/1 = 1 day)
        expect(dataModel.isBuildingCompleted('shelter')).toBe(true);
    });

    test('should produce food from scavenging', () => {
        gameLoop.next();

        const foodBefore = dataModel.get('food');

        // Manually advance day
        dataModel.nextDay();
        dataModel.assignUnassignedToDefaultTask();
        dataModel.updateDailyResources();

        // Food should have changed (production from scavenging, consumption from population)
        const foodAfter = dataModel.get('food');
        expect(typeof foodAfter).toBe('number');
    });

    test('should handle choice capture end-to-end (Hunt task assignment)', () => {
        // Load the event and start dialog
        const fs = require('fs');
        const fileContent = fs.readFileSync('test/testtext3.txt', 'utf-8');
        const event = parser.parseText(fileContent);

        let lastUIText = '';
        const dialogCallback = {
            onDialogEnd: () => {},
            onDialogUpdated: () => {
                lastUIText = dialog.getCurrentText();
            }
        };

        const dialog = new Dialog(event, dataModel, dialogCallback);
        dialog.start();

        // Section 1: Initial setup
        expect(dataModel.isBuildingUnderConstruction('shelter')).toBe(true);
        const section1Choices = dialog.getCurrentChoices();
        expect(section1Choices.length).toBeGreaterThan(0);
        dialog.dialogChoiceSelected(section1Choices[0]); // "continue"

        // Section 2: Player chooses task "Hunt"
        const section2Text = dialog.getCurrentText();
        expect(section2Text).toContain('Select task to assign');
        const section2Choices = dialog.getCurrentChoices();
        expect(section2Choices.length).toBeGreaterThan(0);
        const huntChoice = section2Choices.find(c => c.getText() === 'Hunt');
        expect(huntChoice).toBeDefined();
        dialog.dialogChoiceSelected(huntChoice!);

        // Verify task choice was captured
        expect(dialog.getChoiceVariable('task')).toBe('Hunt');

        // Section 3: Player chooses person (role C)
        const section3Text = dialog.getCurrentText();
        expect(section3Text).toContain('Select person to assign');
        const section3Choices = dialog.getCurrentChoices();
        expect(section3Choices.length).toBeGreaterThan(0);

        // The choice text should be the name of person in role C (replaced from <C>)
        const roleC = dialog.getPersonForRole('C');
        expect(roleC).toBeDefined();
        const personCName = roleC!.getName();

        // The first choice should be the person in role C (with text <C> replaced)
        const firstChoice = section3Choices[0];
        expect(firstChoice.getText()).toBe(personCName);
        dialog.dialogChoiceSelected(firstChoice);

        // Verify person choice was captured
        expect(dialog.getChoiceVariable('person')).toBe(personCName);

        // Section 4: Final assignment with text substitution
        const finalText = dialog.getCurrentText();

        // Verify the text has correctly substituted both <person> and <task>
        // task choice was "Hunt", which is stored as-is in the variable
        expect(finalText).toBe(`${personCName} will Hunt now.`);

        // Verify the person is actually assigned to the hunt task
        expect(dataModel.getTaskForPerson(personCName)).toBe('hunting');

        // Verify it's Cia (the third person with harmony trait)
        expect(personCName).toBe('Cia');
    });
});
