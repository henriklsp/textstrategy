import { Event } from './Event';
import { EventParser } from './EventParser';
import { IGameUI, UI } from './UI';
import { DataModel } from './DataModel';
import { Dialog, DialogCallback } from './Dialog';
import { createDefaultCharacters } from './DefaultCharacters';
import { Choice } from './Choice';
import { DebugFormatter } from './DebugFormatter';

// An event on the queue, to be triggered on a specific day.
// Either an Event, or the name of an event file that is loaded when needed.
interface ScheduledEvent {
    day: number;
    event?: Event;
    eventName?: string;
}

// Core game loop. Manages Event queue, creates Dialog instances, and updates UI.
export class GameLoop implements DialogCallback {
    // Kept sorted by day; events on the same day keep the order they were added
    private eventQueue: ScheduledEvent[];
    // Named events that [event name delay] effects can schedule
    private eventRegistry: Map<string, Event>;
    // Named events being loaded (browser: files are fetched asynchronously)
    private loadingEvents: Map<string, Promise<void>>;
    private parser: EventParser;
    private ui!: IGameUI;
    private dataModel: DataModel;
    private currentDialog: Dialog | null = null;
    // Errors collected in debug mode
    private errors: string[] = [];

    constructor(ui?: IGameUI) {
        this.eventQueue = [];
        this.eventRegistry = new Map<string, Event>();
        this.loadingEvents = new Map<string, Promise<void>>();
        this.parser = new EventParser();
        if (ui) {
            this.ui = ui;
        }
        this.dataModel = new DataModel();

        // Load default characters into the data model
        for (const person of createDefaultCharacters()) {
            this.dataModel.addPerson(person);
        }
    }

    // Factory method to create a GameLoop with default UI
    public static create(): GameLoop {
        const gameLoop = new GameLoop();
        gameLoop.ui = new UI({
            onChoiceSelected: choice => gameLoop.dialogChoiceSelected(choice),
            onContinue: () => gameLoop.endCurrentDialog()
        });
        return gameLoop;
    }

    // Add an event to the queue for a given day (default: today)
    public addEvent(event: Event, day: number = this.dataModel.getCurrentDay()): void {
        this.enqueue({ day, event });
    }

    // Insert after all events on the same or an earlier day
    private enqueue(entry: ScheduledEvent): void {
        let index = this.eventQueue.length;
        while (index > 0 && this.eventQueue[index - 1].day > entry.day) {
            index--;
        }
        this.eventQueue.splice(index, 0, entry);
    }

    // Add an event to the queue to be triggered in delayDays days (current day + n)
    public scheduleEvent(event: Event, delayDays: number): void {
        this.addEvent(event, this.dataModel.getCurrentDay() + Math.max(0, delayDays));
    }

    // Register a named event so [event name delay] effects can schedule it
    public registerEvent(name: string, event: Event): void {
        this.eventRegistry.set(name, event);
    }

    // Called by EventEffect: schedule a named event in delayDays days.
    // Uses the registry, otherwise loads text/<name>.txt (in Node right away,
    // in the browser in the background so it is ready when the day comes).
    public scheduleEventByName(eventName: string, delayDays: number): void {
        this.ensureEventLoaded(eventName);
        if (!this.parser.isBrowserEnvironment() && !this.eventRegistry.has(eventName)) {
            this.recordError(`Unknown event '${eventName}', not scheduled`);
            return;
        }
        this.enqueue({ day: this.dataModel.getCurrentDay() + Math.max(0, delayDays), eventName });
    }

    private ensureEventLoaded(eventName: string): void {
        if (this.eventRegistry.has(eventName) || this.loadingEvents.has(eventName)) return;
        const store = (event: Event): void => {
            if (event.getSections().length > 0) {
                this.eventRegistry.set(eventName, event);
            }
        };
        if (!this.parser.isBrowserEnvironment()) {
            store(this.parser.parseFileSync(this.parser.eventPath(eventName)));
            return;
        }
        this.loadingEvents.set(eventName, this.parser.loadEvent(eventName).then(event => {
            this.loadingEvents.delete(eventName);
            store(event);
        }));
    }

    // Queued events with their scheduled day (copy, for inspection/debugging)
    public getEventQueue(): { day: number; event?: Event; eventName?: string }[] {
        return this.eventQueue.map(e => ({ ...e }));
    }

    // The parser used by the game; its EventEffects put events on this game's queue
    public getParser(): EventParser {
        return this.parser;
    }

    private hasDueEvent(): boolean {
        return this.eventQueue.length > 0 && this.eventQueue[0].day <= this.dataModel.getCurrentDay();
    }

    // Start the next event due today (or earlier). Named events are resolved here;
    // if one is still loading, it starts when loading completes. Unknown events are skipped.
    // Returns false if nothing is due.
    private startNextDueEvent(): boolean {
        if (!this.hasDueEvent()) return false;
        const entry = this.eventQueue.shift()!;
        if (entry.event) {
            this.startDialog(entry.event);
            return true;
        }

        const name = entry.eventName!;
        const event = this.eventRegistry.get(name);
        if (event) {
            this.startDialog(event);
            return true;
        }
        const loading = this.loadingEvents.get(name);
        if (loading) {
            loading.then(() => {
                const loaded = this.eventRegistry.get(name);
                if (loaded) {
                    this.startDialog(loaded);
                } else {
                    this.recordError(`Unknown event '${name}', skipped`);
                    this.continueGame();
                }
            });
            return true;
        }
        this.recordError(`Unknown event '${name}', skipped`);
        this.continueGame();
        return true;
    }

    // Start the next due event; if nothing more is due today, advance day by day
    // until an event is due (daily updates run for every day that passes).
    private continueGame(): void {
        this.clearErrors();
        if (!this.hasDueEvent() && this.eventQueue.length > 0) {
            do {
                this.advanceDay();
            } while (!this.hasDueEvent());
        }
        if (!this.startNextDueEvent()) {
            console.log("No events due");
            this.updateUI();
        }
    }

    // DialogCallback implementation: Called when dialog ends
    public onDialogEnd(): void {
        console.log("Dialog ended");
        
        this.currentDialog = null;
        this.continueGame();
    }

    // DialogCallback implementation: Called when dialog section changes
    public onDialogUpdated(): void {
        this.updateUI();
    }

    // Get the current dialog for UI
    public getCurrentDialog(): Dialog | null {
        return this.currentDialog;
    }

    // Get the data model (for initialization)
    public getDataModel(): DataModel {
        return this.dataModel;
    }

    // Record an error and ensure it's shown in the UI
    private recordError(error: string | Error): void {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : error;
        this.errors.push(message);
        console.error("GameLoop error:", message);
    }

    // Clear errors from previous turn
    private clearErrors(): void {
        this.errors = [];
    }

    // Start a new dialog from an event
    private startDialog(event: Event): void {
        try {
            // Create dialog callback that includes error reporting
            const dialogCallback: DialogCallback = {
                onDialogEnd: () => this.onDialogEnd(),
                onDialogUpdated: () => this.onDialogUpdated(),
                onError: (error) => this.recordError(error)
            };
            this.currentDialog = new Dialog(event, this.dataModel, dialogCallback);
            this.currentDialog.setEffectScheduler((eventName, delayDays) => this.scheduleEventByName(eventName, delayDays));
            this.currentDialog.start();
            this.updateUI();
        } catch (error) {
            this.recordError(error as Error);
            this.updateUI();
        }
    }

    // Update the UI with current dialog state
    private updateUI(): void {
        if (!this.ui) return;
        if (this.currentDialog) {
            const text = this.currentDialog.getCurrentText();
            const choices = this.currentDialog.getCurrentChoices();
            const debugInfo = DebugFormatter.formatDebugInfo(this.dataModel);
            this.ui.show(text, choices, debugInfo, this.errors);
        } else {
            this.ui.show('', [], '', this.errors);
        }
    }

    // Start the next event that is due today (or earlier)
    public next(): void {
        if (!this.startNextDueEvent()) {
            const message = this.eventQueue.length === 0 ? "Event queue is empty" : "No events due today";
            this.recordError(message);
        }
    }

    // Advance to the next day and perform daily updates
    private advanceDay(): void {
        try {
            this.dataModel.nextDay();
            // Assign unassigned people to default task before processing
            this.dataModel.assignUnassignedToDefaultTask();

            // Perform daily resource updates
            this.dataModel.updateDailyResources();
        } catch (error) {
            this.recordError(error as Error);
        }
    }

    // Called when the player moves on from a section without choices
    public endCurrentDialog(): void {
        this.currentDialog?.endDialog();
    }

    // Called when user selects a choice
    public dialogChoiceSelected(choice: Choice): void {
        if (!this.currentDialog) return;

        try {
            this.currentDialog.dialogChoiceSelected(choice);
        } catch (error) {
            this.recordError(error as Error);
            this.updateUI();
        }
    }
}
