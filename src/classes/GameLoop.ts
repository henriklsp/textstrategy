import { Event } from './Event';
import { EventParser } from './EventParser';
import { EventLoader } from './EventLoader';
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

// Days may pass while only pool events remain; never advance more than this
// without anything becoming due (guards against a pool event that can never fire)
const MAX_IDLE_DAYS = 365;

// Core game loop. Manages Event queue, creates Dialog instances, and updates UI.
export class GameLoop implements DialogCallback {
    // Kept sorted by day; events on the same day keep the order they were added
    private eventQueue: ScheduledEvent[];
    // Named events that [event name delay] effects can schedule
    private eventRegistry: Map<string, Event>;
    // Named events being loaded (browser: files are fetched asynchronously)
    private loadingEvents: Map<string, Promise<void>>;
    // Pool events (from the pool manifest / registerPoolEvent) that may fire
    // on their own; by name, resolved through the eventRegistry.
    // tier: 1, 2, ... (lower considered first); events without a priority
    // get the lowest tier (Infinity)
    private pool: { name: string; tier: number }[];
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
        this.pool = [];
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

    // Register an event in the pool by name, with a priority tier (1, 2, ...;
    // lower considered first). Without a tier the event gets the lowest
    // priority. It may then fire on its own (once per registration) on a day
    // with no scheduled events due. The file is loaded now (Node) or in the browser.
    public registerPoolEvent(name: string, tier?: number): void {
        this.ensureEventLoaded(name);
        if (!this.pool.some(e => e.name === name)) {
            this.pool.push({ name, tier: tier ?? Infinity });
        }
    }

    // The pool events currently registered (by name, for inspection/debugging)
    public getPool(): string[] {
        return this.pool.map(e => e.name);
    }

    // Load a pool manifest (default: text/pool.txt). One event name per line;
    // // comments and blank lines are ignored. "priority n:" section headers
    // give the events listed under them that priority tier; events listed
    // before any header get the lowest priority.
    public async loadPoolManifest(path?: string): Promise<void> {
        const loader = new EventLoader();
        const file = path ?? loader.eventPath('pool');
        const content = await loader.load(file);
        if (content === null) return; // No manifest: nothing to register
        let tier = Infinity;
        for (const line of content.split(/\r?\n/)) {
            const name = line.trim();
            if (name === '' || name.startsWith('//')) continue;
            const section = name.toLowerCase().match(/^priority (\d+):?$/);
            if (section) {
                tier = parseInt(section[1], 10);
                continue;
            }
            this.registerPoolEvent(name, tier);
        }
    }

    // On a day with no scheduled events due, at most one pool event fires.
    // Priority tiers are considered in ascending order (priority 1 before 2,
    // etc.; events without a priority last). Within a tier the pick among
    // candidates is random. A fired event leaves the pool (fires once per
    // registration).
    // Returns true if an event was put on the queue for today.
    private firePoolEventIfIdle(): boolean {
        if (this.hasDueEvent() || this.pool.length === 0) return false;
        const tiers = [...new Set(this.pool.map(e => e.tier))].sort((a, b) => a - b);
        for (const tier of tiers) {
            const ready = this.pool
                .filter(e => e.tier === tier && this.eventRegistry.has(e.name))
                .map(e => ({ name: e.name, event: this.eventRegistry.get(e.name)! }))
                .filter(e => e.event.arePrerequisitesMet(this.dataModel));
            if (ready.length === 0) continue;
            const pick = ready[Math.floor(Math.random() * ready.length)];
            this.pool = this.pool.filter(e => e.name !== pick.name);
            this.enqueue({ day: this.dataModel.getCurrentDay(), eventName: pick.name });
            return true;
        }
        return false;
    }

    // Start the next event due today (or earlier). Named events are resolved here;
    // if one is still loading, it starts when loading completes. Unknown events are skipped.
    // Events whose header prerequisites are not met are moved to the next day with
    // no other due events, and the next due event is started instead.
    // Returns false if nothing is due.
    private startNextDueEvent(): boolean {
        if (!this.hasDueEvent()) return false;
        const entry = this.eventQueue.shift()!;
        if (entry.event) {
            return this.startDueEvent(entry);
        }

        const name = entry.eventName!;
        const event = this.eventRegistry.get(name);
        if (event) {
            return this.startDueEvent(entry, event);
        }
        const loading = this.loadingEvents.get(name);
        if (loading) {
            loading.then(() => {
                const loaded = this.eventRegistry.get(name);
                if (loaded) {
                    if (!this.startDueEvent(entry, loaded)) {
                        // Prerequisites not met and nothing else due: advance the days
                        this.continueGame();
                    }
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

    // Start a due event if its header prerequisites are met.
    // If not, move it to the next day with no other due events and
    // continue with the next due event (there may still be one today).
    private startDueEvent(entry: ScheduledEvent, event?: Event): boolean {
        const theEvent = event ?? entry.event!;
        if (!theEvent.arePrerequisitesMet(this.dataModel)) {
            this.requeueNextFreeDay(entry);
            // By-design game flow, not an error: do not show in the UI's red error list
            console.log(`Event '${entry.eventName ?? 'event'}' prerequisites not met, moved to day ${entry.day}`);
            return this.startNextDueEvent();
        }
        this.startDialog(theEvent);
        return true;
    }

    // Move a queue entry to the next day that has no other due events
    private requeueNextFreeDay(entry: ScheduledEvent): void {
        let day = this.dataModel.getCurrentDay() + 1;
        while (this.eventQueue.some(e => e.day === day)) {
            day++;
        }
        entry.day = day;
        this.enqueue(entry);
    }

    // Start the next due event; if nothing more is due today, advance day by day
    // until an event is due (daily updates run for every day that passes).
    private continueGame(): void {
        this.clearErrors();
        let daysPassed = 0;
        while (!this.hasDueEvent() && daysPassed < MAX_IDLE_DAYS) {
            // Nothing scheduled anywhere: an empty pool cannot produce anything
            if (this.eventQueue.length === 0 && this.pool.length === 0) break;
            this.advanceDay();
            daysPassed++;
            // An idle day (no scheduled event due) may fire one pool event
            this.firePoolEventIfIdle();
        }
        if (daysPassed >= MAX_IDLE_DAYS) {
            console.log(`Advance-day guard tripped after ${MAX_IDLE_DAYS} idle days; check for a pool event whose prerequisites can never be met`);
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

    // Start the next event that is due today (or earlier). If nothing is due,
    // a pool event may fire for today instead.
    public next(): void {
        if (!this.startNextDueEvent()) {
            if (this.firePoolEventIfIdle() && this.startNextDueEvent()) {
                return;
            }
            const message = this.eventQueue.length === 0 && this.pool.length === 0
                ? "Event queue is empty"
                : "No events due today";
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
