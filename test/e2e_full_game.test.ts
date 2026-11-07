// End-to-end test: runs the complete game as-is for the first 20 days
// (or until it fails / deadlocks), with a mock UI that logs all text
// output and player input, producing a complete readable story log.
//
// The game is used exactly as the browser does it (GameLoop + DataModel +
// EventParser + text/*.txt files). Only the UI is mocked: instead of
// rendering to a page, the mock logs every shown section and picks the
// player's choice from a seeded PRNG, so the whole story is reproducible.
//
// Set E2E_LOG_FILE to control where the story log is written
// (default: e2e_story.log in the current directory).
// Set E2E_DAYS (default 20) and E2E_SEED (default 1) to vary a run.

import { GameLoop } from '../src/classes/GameLoop.ts';
import type { IGameUI } from '../src/classes/UI.ts';
import { UI } from '../src/classes/UI.ts';
import { Choice } from '../src/classes/Choice.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------- deterministic randomness ----------
// A small seeded PRNG (mulberry32). We replace Math.random for the whole
// run so both the player's choices and the game's own random picks
// (e.g. pool event selection) are reproducible from the seed alone.
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEED = parseInt(process.env.E2E_SEED ?? '1', 10);
const TARGET_DAY = parseInt(process.env.E2E_DAYS ?? '20', 10);
const LOG_FILE = process.env.E2E_LOG_FILE ?? path.join(process.cwd(), 'e2e_story.log');

// Safety guards against runaway / infinite play
const MAX_STEPS = 100000;          // total player inputs across the run
const MAX_SAME_STATE = 500;        // identical (day, text, choices) shown in a row

// The latest state shown by the game, waiting for the player's input.
interface ShownState {
    text: string;
    choices: Choice[];
    debugInfo: string;
    errors: string[];
}

class StoryLog {
    private lines: string[] = [];
    public add(line: string): void { this.lines.push(line); }
    public save(): string {
        const content = this.lines.join('\n');
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
        fs.writeFileSync(LOG_FILE, content, 'utf8');
        return content;
    }
}

class MockUI implements IGameUI {
    public latest: ShownState | null = null;
    private readonly log: StoryLog;

    constructor(log: StoryLog) { this.log = log; }

    public show(text: string, choices: Choice[], debugInfo: string = '', errors: string[] = []): void {
        this.latest = { text, choices: [...choices], debugInfo, errors: [...errors] };
        // Errors are recorded in the log immediately, in order of appearance
        for (const error of errors) {
            this.log.add(`!! ERROR: ${error}`);
        }
    }
}

describe('End-to-end: full game with mock UI', () => {
    test(`plays the first ${TARGET_DAY} days (seed ${SEED}) and logs the full story`, async () => {
        const log = new StoryLog();
        log.add(`=== Textstrategy end-to-end story log ===`);
        log.add(`Seed: ${SEED} | Target day: ${TARGET_DAY} | Started: ${new Date().toISOString()}`);
        log.add('');

        // Seed all randomness for this run
        const rand = mulberry32(SEED);
        const originalRandom = Math.random;
        (globalThis as any).Math.random = rand;

        const ui = new MockUI(log);
        const gameLoop = new GameLoop(ui);

        // The same initialization Main.initialize() performs, but into our
        // GameLoop (Main hard-codes the real UI; all steps below are the
        // public APIs Main itself uses, so the game is otherwise untouched).
        const dataModel = gameLoop.getDataModel();
        dataModel.setCurrentDay(1);
        dataModel.set('population', 5);
        dataModel.set('food', 1);
        dataModel.set('wood', 5);
        dataModel.setBounty(10);

        await gameLoop.loadPoolManifest();

        const intro = await gameLoop.getParser().loadEvent('intro');
        if (intro.getSections().length === 0) {
            throw new Error('Failed to load intro event or intro.txt is empty');
        }
        gameLoop.addEvent(intro);
        gameLoop.next();

        // ---------- drive the game ----------
        let steps = 0;
        let sameStateCount = 0;
        let lastSignature = '';
        let engineError: string | null = null;
        let endReason = `reached target day ${TARGET_DAY}`; // updated below if we stop earlier

        while (true) {
            const day = dataModel.getCurrentDay();
            if (day > TARGET_DAY) {
                break; // target reached; stop before logging or playing the new day
            }

            const state = ui.latest;
            if (engineError !== null) {
                endReason = `engine error on day ${day}`;
                break;
            }
            if (!state) {
                endReason = 'game showed nothing (no UI state)';
                break;
            }

            // Infinite-loop guard: identical screen shown over and over
            const signature = `${day}\u0000${state.text}\u0000${state.choices.map(c => c.getText()).join('\u0001')}`;
            if (signature === lastSignature) {
                sameStateCount++;
                if (sameStateCount > MAX_SAME_STATE) {
                    engineError = `infinite loop: same state repeated ${sameStateCount} times on day ${day}`;
                    endReason = engineError;
                    break;
                }
            } else {
                sameStateCount = 0;
                lastSignature = signature;
            }

            if (steps++ > MAX_STEPS) {
                engineError = `runaway game: more than ${MAX_STEPS} player inputs`;
                endReason = engineError;
                break;
            }

            // Any engine error reported through the UI fails the run
            // (except the natural end-of-content cases handled below).
            if (state.errors.length > 0) {
                const naturalEnd =
                    state.errors.some(e => e.includes('Event queue is empty')) ||
                    state.errors.some(e => e.includes('No events due today'));
                const hasContent =
                    gameLoop.getCurrentDialog() !== null ||
                    gameLoop.getEventQueue().length > 0 ||
                    gameLoop.getPool().length > 0;
                if (naturalEnd && !hasContent) {
                    endReason = `no content left (queue and pool empty) on day ${day}`;
                    break;
                }
                engineError = state.errors.join('; ');
                endReason = `engine error on day ${day}`;
                break;
            }

            // Log what the player sees: just the output text, then the input
            log.add('');
            log.add(UI.toParagraphs(state.text).join('\n\n'));

            // Pick the player's input: seeded random choice, or Continue
            if (state.choices.length === 0) {
                log.add('');
                gameLoop.endCurrentDialog();
            } else {
                const index = Math.floor(rand() * state.choices.length);
                const choice = state.choices[index];
                log.add(`> ${choice.getText()}`);
                gameLoop.dialogChoiceSelected(choice);
            }
        }

        (globalThis as any).Math.random = originalRandom;

        // ---------- finalize ----------
        log.add('');
        log.add('=== End of run ===');
        log.add(`Reason: ${endReason}`);
        log.add(`Days played: ${dataModel.getCurrentDay()}`);
        const saved = log.save();

        // The test asserts the run stayed healthy
        expect(engineError).toBeNull();
        expect(saved.length).toBeGreaterThan(0);
        expect(steps).toBeGreaterThan(0);
        console.log(`E2E story (${endReason}) written to ${LOG_FILE} (${saved.length} chars)`);
    }, 300000);
});
