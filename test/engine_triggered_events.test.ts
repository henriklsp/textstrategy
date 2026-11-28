import { GameLoop } from '../src/classes/GameLoop.ts';
import { DataModel } from '../src/classes/DataModel.ts';
import { Person } from '../src/classes/Person.ts';

// Engine-triggered construction-complete events: when a construction
// completes during the daily update, the engine itself schedules the
// building type's completion event (workinprogress/completed<type>) for that
// same morning. Engine behavior only, no prose assertions.
describe('Engine-triggered construction-complete events', () => {

    // A fresh DataModel with one healthy builder in the cast
    const freshModel = (): DataModel => {
        const model = new DataModel();
        model.addPerson(new Person('Alice', 'life', 'magic', 'harmony'));
        model.addPerson(new Person('Bob', 'divinity', 'chaos', 'harmony'));
        return model;
    };

    test('completing a building queues a trigger with the building completion event name', () => {
        const model = freshModel();
        model.set('wood', 1);
        expect(model.startBuildingConstruction('shelter')).toBe(true);
        model.assignPersonToTask('Alice', 'build');

        model.updateDailyResources();

        expect(model.isBuildingCompleted('shelter')).toBe(true);
        const triggers = model.consumePendingTriggers();
        expect(triggers).toEqual([{ eventName: 'workinprogress/completedshelter' }]);
        // Triggers are handed out exactly once
        expect(model.consumePendingTriggers()).toEqual([]);
    });

    test('each building type queues its own completion event', () => {
        // Fence: 1 man-day, one builder
        const fenceModel = freshModel();
        fenceModel.set('wood', 1);
        fenceModel.startBuildingConstruction('fence');
        fenceModel.assignPersonToTask('Alice', 'build');
        fenceModel.updateDailyResources();
        expect(fenceModel.consumePendingTriggers())
            .toEqual([{ eventName: 'workinprogress/completedfence' }]);

        // Raft: 2 man-days, two builders in one day
        const raftModel = freshModel();
        raftModel.set('wood', 2);
        raftModel.startBuildingConstruction('raft');
        raftModel.assignPersonToTask('Alice', 'build');
        raftModel.assignPersonToTask('Bob', 'build');
        raftModel.updateDailyResources();
        expect(raftModel.consumePendingTriggers())
            .toEqual([{ eventName: 'workinprogress/completedraft' }]);
    });

    test('no builder means no completion and no trigger, even with banked man-days', () => {
        const model = freshModel();
        model.set('wood', 1);
        model.set('mandaysspent', 5); // banked labour cannot finish a site
        model.startBuildingConstruction('shelter');
        // Nobody assigned to build

        model.updateDailyResources();

        expect(model.isBuildingCompleted('shelter')).toBe(false);
        expect(model.consumePendingTriggers()).toEqual([]);
    });

    test('triggers are transient and never serialized', () => {
        const model = freshModel();
        model.set('wood', 1);
        model.startBuildingConstruction('shelter');
        model.assignPersonToTask('Alice', 'build');
        model.updateDailyResources();
        expect(model.consumePendingTriggers().length).toBe(1);

        // The trigger itself is not part of the saved state
        const saved = JSON.stringify(model.toJSON());
        expect(saved).not.toContain('pendingTriggers');

        // A restored model starts with no pending triggers
        const restored = DataModel.fromJSON(JSON.parse(saved) as any);
        expect(restored.consumePendingTriggers()).toEqual([]);
    });

    describe('GameLoop wiring', () => {
        const buildToCompletion = (building: string, builders: string[]): GameLoop => {
            const gameLoop = new GameLoop();
            const model = gameLoop.getDataModel();
            model.set('wood', building === 'raft' ? 2 : 1);
            model.startBuildingConstruction(building as any);
            for (const name of builders) {
                model.assignPersonToTask(name, 'build');
            }
            return gameLoop;
        };

        test('advanceDay schedules the completion event due the same day and it plays', () => {
            const gameLoop = buildToCompletion('shelter', ['Arik']);
            gameLoop.advanceDay();

            const queue = gameLoop.getEventQueue();
            expect(queue).toEqual([{ day: 1, eventName: 'workinprogress/completedshelter' }]);

            // The event starts and renders cleanly with two choices
            gameLoop.next();
            const dialog = gameLoop.getCurrentDialog();
            expect(dialog).not.toBeNull();
            const text = dialog!.getCurrentText();
            expect(text).toContain('shelter');
            expect(text).not.toMatch(/<[^>]+>/); // no raw tags leak into prose
            expect(text).not.toContain('ERROR');
            expect(dialog!.getCurrentChoices().length).toBe(2);
        });

        test('no completion means advanceDay schedules nothing', () => {
            const gameLoop = buildToCompletion('shelter', []); // no builder
            gameLoop.advanceDay();
            expect(gameLoop.getEventQueue()).toEqual([]);
        });

        test('the council choice chains the council meeting for the same day', () => {
            const gameLoop = buildToCompletion('shelter', ['Arik']);
            gameLoop.advanceDay();
            gameLoop.next();
            const dialog = gameLoop.getCurrentDialog()!;
            const councilChoice = dialog.getCurrentChoices()
                .find(c => c.getText().includes('Call the others together'))!;
            expect(councilChoice).toBeDefined();

            gameLoop.dialogChoiceSelected(councilChoice);
            // The council-chain section is choiceless and schedules council delay 0
            expect(gameLoop.getCurrentDialog()!.getCurrentChoices()).toEqual([]);
            const queue = gameLoop.getEventQueue();
            expect(queue).toEqual([{ day: 1, eventName: 'workinprogress/council' }]);

            // Moving on from the choiceless section starts the council meeting
            gameLoop.endCurrentDialog();
            const councilDialog = gameLoop.getCurrentDialog();
            expect(councilDialog).not.toBeNull();
            expect(councilDialog!.getCurrentText()).toContain('council');
            expect(councilDialog!.getCurrentText()).not.toContain('ERROR');
        });

        test('the leave-it choice ends without scheduling anything new', () => {
            const gameLoop = buildToCompletion('fence', ['Arik']);
            gameLoop.advanceDay();
            gameLoop.next();
            const dialog = gameLoop.getCurrentDialog()!;
            const laterChoice = dialog.getCurrentChoices()
                .find(c => c.getText().includes('Leave the deciding for later'))!;
            expect(laterChoice).toBeDefined();

            gameLoop.dialogChoiceSelected(laterChoice);
            expect(gameLoop.getCurrentDialog()!.getCurrentChoices()).toEqual([]);
            gameLoop.endCurrentDialog();
            expect(gameLoop.getCurrentDialog()).toBeNull();
            expect(gameLoop.getEventQueue()).toEqual([]);
        });
    });
});
