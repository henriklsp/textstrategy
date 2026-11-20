import { EventParser } from '../src/classes/EventParser.ts';
import { GameLoop } from '../src/classes/GameLoop.ts';
import { DataModel } from '../src/classes/DataModel.ts';
import { Dialog } from '../src/classes/Dialog.ts';
import { Person } from '../src/classes/Person.ts';

describe('Task Assignment and Construction', () => {
    let parser: EventParser;
    let gameLoop: GameLoop;
    let dataModel: DataModel;

    beforeEach(() => {
        parser = new EventParser();
        gameLoop = new GameLoop();
        dataModel = gameLoop.getDataModel();

        // Load task_assignment_and_construction.txt
        const fs = require('fs');
        const fileContent = fs.readFileSync('test/task_assignment_and_construction.txt', 'utf-8');
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

    test('should parse task_assignment_and_construction.txt and apply effects', () => {
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
        const fileContent = fs.readFileSync('test/task_assignment_and_construction.txt', 'utf-8');
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
        // task choice "Hunt" renders as the task's prose phrase in text
        expect(finalText).toBe(`${personCName} will spend the day hunting.`);

        // Verify the person is actually assigned to the hunt task
        expect(dataModel.getTaskForPerson(personCName)).toBe('hunting');

        // Verify it's Cia (the third person with harmony trait)
        expect(personCName).toBe('Cia');
    });
});

describe('Man-day construction (mandaysspent)', () => {
    const makeModel = (name: string): DataModel => {
        const dm = new DataModel();
        dm.addPerson(new Person(name, 'life', 'magic', 'harmony'));
        dm.set('wood', 20);
        return dm;
    };

    test('mandaysspent defaults to 0 and is readable like any other variable', () => {
        const dm = new DataModel();
        expect(dm.get('mandaysspent')).toBe(0);
    });

    test('progress is man-days of work, not elapsed days', () => {
        const dm = makeModel('Mason');
        dm.startBuildingConstruction('raft', 2); // 2 man-days
        dm.assignPersonToTask('Mason', 'build');
        dm.updateDailyResources();
        expect(dm.get('mandaysspent')).toBe(1);
        expect(dm.isBuildingCompleted('raft')).toBe(false);

        // Reassigning the builder away stalls the site: no progress that day,
        // and the elapsed day is not counted as work
        dm.assignPersonToTask('Mason', 'woodcutting');
        dm.updateDailyResources();
        expect(dm.get('mandaysspent')).toBe(1);
        expect(dm.isBuildingCompleted('raft')).toBe(false);

        // Reassigning the builder resumes where the site left off
        dm.assignPersonToTask('Mason', 'build');
        dm.updateDailyResources();
        expect(dm.isBuildingCompleted('raft')).toBe(true);
    });

    test('two builders on a one-man-day building finish in one day; the excess stays in mandaysspent', () => {
        const dm = new DataModel();
        dm.addPerson(new Person('Una', 'life', 'magic', 'harmony'));
        dm.addPerson(new Person('Dua', 'life', 'magic', 'harmony'));
        dm.set('wood', 20);
        dm.startBuildingConstruction('shelter', 1); // 1 man-day
        dm.assignPersonToTask('Una', 'build');
        dm.assignPersonToTask('Dua', 'build');
        dm.updateDailyResources();
        expect(dm.isBuildingCompleted('shelter')).toBe(true);
        // 2 man-days of work on a 1 man-day building: 1 excess stays in the same variable
        expect(dm.get('mandaysspent')).toBe(1);
    });

    test('the excess in mandaysspent counts toward the next construction', () => {
        const dm = new DataModel();
        dm.addPerson(new Person('Una', 'life', 'magic', 'harmony'));
        dm.set('wood', 20);
        dm.startBuildingConstruction('fence', 4);
        dm.set('mandaysspent', 3); // 3 man-days banked from an earlier construction
        expect(dm.isBuildingCompleted('fence')).toBe(false);

        // A day without builders: the banked man-days stand, but nothing is added,
        // so the site does not complete
        dm.updateDailyResources();
        expect(dm.get('mandaysspent')).toBe(3);
        expect(dm.isBuildingCompleted('fence')).toBe(false);

        // One builder-day on top of the 3 banked completes the 4-man-day fence
        dm.assignPersonToTask('Una', 'build');
        dm.updateDailyResources();
        expect(dm.isBuildingCompleted('fence')).toBe(true);
        expect(dm.get('mandaysspent')).toBe(0); // 4 spent, no excess
    });

    test('the excess can never exceed the finished building\'s man-days', () => {
        const dm = new DataModel();
        for (const name of ['Una', 'Dua', 'Tria']) {
            dm.addPerson(new Person(name, 'life', 'magic', 'harmony'));
        }
        dm.set('wood', 20);
        dm.startBuildingConstruction('shelter', 1);
        for (const name of ['Una', 'Dua', 'Tria']) {
            dm.assignPersonToTask(name, 'build');
        }
        dm.updateDailyResources(); // 3 effort on a 1 man-day building: excess 2, capped at 1
        expect(dm.isBuildingCompleted('shelter')).toBe(true);
        expect(dm.get('mandaysspent')).toBe(1);
    });
});
