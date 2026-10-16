import { Dialog, DialogCallback } from '../src/classes/Dialog';
import { DataModel } from '../src/classes/DataModel';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { PersonSelection } from '../src/classes/PersonSelection';
import { Person } from '../src/classes/Person';
import { createDefaultCharacters } from '../src/classes/DefaultCharacters';

// Render a single section through a Dialog, like the game UI would.
function renderText(dataModel: DataModel, text: string, personSelections: PersonSelection[] = []): string {
    const section = new Section(text, [], [], personSelections);
    const event = new Event([section]);
    const callback: DialogCallback = { onDialogEnd: jest.fn(), onDialogUpdated: jest.fn() };
    const dialog = new Dialog(event, dataModel, callback);
    dialog.start();
    return dialog.getCurrentText();
}

describe('Worker report substitutions', () => {
    let dataModel: DataModel;

    beforeEach(() => {
        dataModel = new DataModel();
        for (const person of createDefaultCharacters()) {
            dataModel.addPerson(person);
        }
        jest.clearAllMocks();
    });

    describe('<working task>: single-task clause', () => {
        test('renders a single worker in third person', () => {
            dataModel.assignPersonToTask('Arik', 'fishing');
            expect(renderText(dataModel, 'Shore. <working fishing>')).toBe('Shore. Arik is fishing.');
        });

        test('fuzzy-matches the task name like fish->fishing', () => {
            dataModel.assignPersonToTask('Arik', 'fishing');
            expect(renderText(dataModel, 'Shore. <working fish>')).toBe('Shore. Arik is fishing.');
        });

        test('joins two workers with and and uses "are"', () => {
            dataModel.assignPersonToTask('Arik', 'fishing');
            dataModel.assignPersonToTask('Eya', 'fishing');
            expect(renderText(dataModel, '<working fishing>')).toBe('Arik and Eya are fishing.');
        });

        test('joins three workers with commas and and', () => {
            dataModel.assignPersonToTask('Bearn', 'scavenge');
            dataModel.assignPersonToTask('Eya', 'scavenge');
            dataModel.assignPersonToTask('Elrid', 'scavenge');
            expect(renderText(dataModel, '<working scavenge>')).toBe('Bearn, Eya and Elrid are scavenging.');
        });

        test('uses the task phrase from TaskPhrases (woodcutting)', () => {
            dataModel.assignPersonToTask('Arik', 'woodcutting');
            expect(renderText(dataModel, '<working woodcut>')).toBe('Arik is cutting wood.');
        });

        test('names the building for the build task', () => {
            dataModel.startBuildingConstruction('hall');
            dataModel.assignPersonToTask('Eya', 'build');
            expect(renderText(dataModel, '<working build>')).toBe('Eya is building the hall.');
        });

        test('renders nothing when nobody is doing the task', () => {
            expect(renderText(dataModel, '<working fishing>')).toBe('');
        });

        test('keeps an invalid task name visible', () => {
            expect(renderText(dataModel, '<working sailing>')).toBe('<working sailing>');
        });

        test('refers to the current role in first person when alone', () => {
            // *D: harmony resolves to Bearn (the only person with positive harmony)
            dataModel.assignPersonToTask('Bearn', 'fishing');
            const selections = [PersonSelection.createSingle('D', 'harmony')];
            expect(renderText(dataModel, '<D> reports: <working fishing>', selections))
                .toBe('Bearn reports: I am fishing.');
        });

        test('puts the current role last, in first person, with others', () => {
            dataModel.assignPersonToTask('Bearn', 'fishing');
            dataModel.assignPersonToTask('Eya', 'fishing');
            const selections = [PersonSelection.createSingle('D', 'harmony')];
            expect(renderText(dataModel, '<D> reports: <working fishing>', selections))
                .toBe('Bearn reports: Eya and I are fishing.');
        });
    });

    describe('<working task>: aggregation for large casts', () => {
        test('lists up to five names', () => {
            for (let i = 1; i <= 5; i++) {
                dataModel.assignPersonToTask(`Q${i}`, 'farming');
            }
            expect(renderText(dataModel, '<working farming>')).toBe('Q1, Q2, Q3, Q4 and Q5 are farming.');
        });

        test('aggregates to "First and N others" beyond five names', () => {
            for (let i = 1; i <= 6; i++) {
                dataModel.assignPersonToTask(`P${i}`, 'farming');
            }
            expect(renderText(dataModel, '<working farming>')).toBe('P1 and 5 others are farming.');
        });

        test('aggregates large groups including the speaker', () => {
            for (let i = 1; i <= 7; i++) {
                dataModel.assignPersonToTask(`P${i}`, 'farming');
            }
            dataModel.assignPersonToTask('Bearn', 'farming');
            const selections = [PersonSelection.createSingle('D', 'harmony')];
            expect(renderText(dataModel, '<working farming>', selections))
                .toBe('P1 and 7 others are farming.');
        });
    });

    describe('<taskreport>: full council report', () => {
        test('groups by task and puts the speaker\'s clause last with "And"', () => {
            dataModel.startBuildingConstruction('hall');
            dataModel.assignPersonToTask('Bearn', 'fishing');
            dataModel.assignPersonToTask('Arik', 'scavenge');
            dataModel.assignPersonToTask('Eya', 'build');
            const selections = [PersonSelection.createSingle('D', 'harmony')];
            expect(renderText(dataModel, '<D> says "<taskreport>"', selections))
                .toBe('Bearn says "Arik is scavenging. Eya is building the hall. And I am fishing."');
        });

        test('mentions resting people like any other task', () => {
            dataModel.assignPersonToTask('Agnar', 'rest');
            dataModel.assignPersonToTask('Elrid', 'rest');
            expect(renderText(dataModel, '<taskreport>')).toBe('Agnar and Elrid are resting.');
        });

        test('renders a default sentence when no task is assigned to anyone', () => {
            expect(renderText(dataModel, '<taskreport>')).toBe('Nobody is doing anything right now.');
        });

        test('all clauses in third person when the speaker has no task', () => {
            dataModel.assignPersonToTask('Arik', 'scavenge');
            dataModel.assignPersonToTask('Eya', 'fishing');
            const selections = [PersonSelection.createSingle('D', 'harmony')];
            expect(renderText(dataModel, '<taskreport>', selections))
                .toBe('Arik is scavenging. Eya is fishing.');
        });
    });
});
