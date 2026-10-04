import * as fs from 'fs';
import * as path from 'path';
import { DataModel } from '../src/classes/DataModel';
import { Dialog } from '../src/classes/Dialog';
import { Event } from '../src/classes/Event';
import { Section } from '../src/classes/Section';
import { Choice } from '../src/classes/Choice';
import { Person } from '../src/classes/Person';
import { PersonSelection } from '../src/classes/PersonSelection';
import { EventParser } from '../src/classes/EventParser';
import { GameLoop } from '../src/classes/GameLoop';
import { Main } from '../src/classes/Main';
import { UI } from '../src/classes/UI';
import { StartConstructionEffect } from '../src/classes/StartConstructionEffect';
import { defaultCharacters } from '../src/classes/DefaultCharacters';
import { DebugFormatter } from '../src/classes/DebugFormatter';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// Render one piece of text as the current section of a dialog
function render(text: string, dataModel = new DataModel()): string {
    const section = new Section(text, [], [], [], 1);
    const dialog = new Dialog(new Event([section]), dataModel, noop);
    dialog.start();
    return dialog.getCurrentText();
}

describe('Content files', () => {
    const textDir = path.join(__dirname, '..', 'text');
    const files = fs.readdirSync(textDir).filter(f => f.endsWith('.txt'));

    test.each(files)('text/%s parses without issues', file => {
        const parser = new EventParser();
        const event = parser.parseText(fs.readFileSync(path.join(textDir, file), 'utf-8'), file);
        expect(parser.getIssues()).toEqual([]);
        expect(event.getSections().length).toBeGreaterThan(0);
    });

    test('text/intro.txt role selections fit the default characters', () => {
        const dataModel = new DataModel();
        defaultCharacters.forEach(p => dataModel.addPerson(p));
        const event = new EventParser().parseFileSync('text/intro.txt');
        expect(() => new Dialog(event, dataModel, noop).start()).not.toThrow();
    });
});

describe('Role assignment', () => {
    // Small deterministic pseudo-random generator
    function rng(seed: number): () => number {
        return () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
    }
    const TRAITS = ['magic', 'life', 'divinity', 'harmony'];

    test('finds the assignment with the highest total score', () => {
        const random = rng(42);
        for (let round = 0; round < 50; round++) {
            const cast: Person[] = [];
            for (let i = 0; i < 5; i++) {
                const shuffled = [...TRAITS].sort(() => random() - 0.5);
                cast.push(new Person(`P${i}`, shuffled[0], shuffled[1], shuffled[2]));
            }
            const selections = ['A', 'B', 'C'].map(role => {
                const trait = TRAITS[Math.floor(random() * TRAITS.length)];
                return PersonSelection.parse(`${role}: ${random() < 0.5 ? '-' : ''}${trait}`)!;
            });
            const dataModel = new DataModel();
            cast.forEach(p => dataModel.addPerson(p));
            const section = new Section('x', [], [], selections, 1);
            const dialog = new Dialog(new Event([section]), dataModel, noop);
            dialog.start();

            const chosen = selections.map(s => dialog.getPersonForRole(s.getRoleName())!);
            expect(new Set(chosen).size).toBe(3);
            const chosenScore = selections.reduce((sum, s, i) => sum + s.calculateScore(chosen[i]), 0);

            let bestScore = -Infinity;
            for (const a of cast) for (const b of cast) for (const c of cast) {
                if (a === b || a === c || b === c) continue;
                const score = selections[0].calculateScore(a) + selections[1].calculateScore(b) + selections[2].calculateScore(c);
                bestScore = Math.max(bestScore, score);
            }
            expect(chosenScore).toBe(bestScore);
        }
    });

    test('throws if a section has more roles than characters', () => {
        const dataModel = new DataModel();
        dataModel.addPerson(new Person('Only', 'magic', 'life', 'harmony'));
        const event = new EventParser().parseText('*A: magic\n*B: life\n§1\n<A> and <B>');
        expect(() => new Dialog(event, dataModel, noop).start()).toThrow(/2 roles \(A, B\).*1 character/);
    });

    test('throws if there are roles but no characters', () => {
        const event = new EventParser().parseText('*A: magic\n§1\n<A>');
        expect(() => new Dialog(event, new DataModel(), noop).start()).toThrow(/roles/);
    });
});

describe('Text rendering', () => {
    test('supports nested tags', () => {
        const dm = new DataModel();
        dm.set('rich', true);
        dm.set('gold', 7);
        expect(render('<rich?You have <gold> gold<gold 5?, a lot;>.;You are poor.>', dm)).toBe('You have 7 gold, a lot.');
        dm.set('rich', false);
        expect(render('<rich?You have <gold> gold.;You are poor.>', dm)).toBe('You are poor.');
    });

    test('random options may contain tags and semicolons inside nested tags', () => {
        const dm = new DataModel();
        dm.set('food', 3);
        expect(['a3', 'b']).toContain(render('<?a<food>;b>', dm));
        expect(['x', 'y']).toContain(render('<?<food 1?x;z>;y>', dm));
    });

    test('<x?a;b> treats a non-zero number as true', () => {
        const dm = new DataModel();
        dm.set('silver', 2);
        expect(render('<silver?some;none>', dm)).toBe('some');
        dm.set('silver', 0);
        expect(render('<silver?some;none>', dm)).toBe('none');
    });

    test('unknown tags are left visible', () => {
        expect(render('Hello <nobody> and <what is this>')).toBe('Hello <nobody> and <what is this>');
    });

    test('an unclosed tag is kept as text', () => {
        expect(render('Broken <?a;b')).toBe('Broken <?a;b');
    });

    test('choice condition (food 2?) means food >= 2, like <food 2?a;b>', () => {
        const dm = new DataModel();
        const event = new EventParser().parseText('§1\nHi\n#2 (food 2?) Eat\n#2 Leave\n§2\nBye');
        const dialog = new Dialog(event, dm, noop);
        dialog.start();
        expect(dialog.getCurrentChoices().map(c => c.getText())).toEqual(['Leave']);
        dm.set('food', 2);
        expect(dialog.getCurrentChoices().map(c => c.getText())).toEqual(['Eat', 'Leave']);
    });
});

describe('Sections without choices', () => {
    test('have no choices; the UI offers Continue, which ends the dialog', () => {
        const g = new GameLoop();
        g.addEvent(new EventParser().parseText('§1\nStart\n#2 Next\n§2\nNo choices here'));
        g.next();
        const dialog = g.getCurrentDialog()!;
        g.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(dialog.getCurrentText()).toBe('No choices here');
        expect(dialog.getCurrentChoices()).toEqual([]);
        g.endCurrentDialog();
        expect(g.getCurrentDialog()).toBeNull();
    });

    test('a section whose choices are all hidden has no choices', () => {
        const event = new EventParser().parseText('§1\nStart\n#2 (secret?) Hidden');
        const dialog = new Dialog(event, new DataModel(), noop);
        dialog.start();
        expect(dialog.getCurrentChoices()).toEqual([]);
    });

    test('a choice to a section that does not exist ends the dialog', () => {
        const onDialogEnd = jest.fn();
        const event = new EventParser().parseText('§1\nStart\n#42 Leave');
        const dialog = new Dialog(event, new DataModel(), { onDialogEnd, onDialogUpdated: () => {} });
        dialog.start();
        dialog.dialogChoiceSelected(dialog.getCurrentChoices()[0]);
        expect(onDialogEnd).toHaveBeenCalled();
    });
});

describe('UI', () => {
    const makeUI = () => {
        const onChoiceSelected = jest.fn();
        const onContinue = jest.fn();
        return { ui: new UI({ onChoiceSelected, onContinue }), onChoiceSelected, onContinue };
    };

    test('blank lines separate paragraphs; other line breaks become spaces', () => {
        expect(UI.toParagraphs('Line one\nline two.\n\nSecond paragraph.\n \n\nThird.'))
            .toEqual(['Line one line two.', 'Second paragraph.', 'Third.']);
        expect(UI.toParagraphs('')).toEqual([]);
    });

    test('shows the choices, or Continue when there are none', () => {
        const { ui, onChoiceSelected, onContinue } = makeUI();
        const choice = new Choice('Go', [], undefined);
        const items = ui.toChoiceItems([choice]);
        expect(items.map(i => i.text)).toEqual(['Go']);
        items[0].onSelect();
        expect(onChoiceSelected).toHaveBeenCalledWith(choice);

        const none = ui.toChoiceItems([]);
        expect(none.map(i => i.text)).toEqual(['Continue']);
        none[0].onSelect();
        expect(onContinue).toHaveBeenCalled();
    });
});

describe('EventParser validation and text', () => {
    const issuesFor = (text: string): string[] => {
        const parser = new EventParser();
        parser.parseText(text);
        return parser.getIssues().map(i => `${i.line}: ${i.message}`);
    };

    test('reports problems with line numbers', () => {
        const issues = issuesFor([
            'stray text',            // 1
            '§1',                    // 2
            '[var gold lots]',       // 3
            '[fly away]',            // 4
            '[task A sleeping]',     // 5
            '[build castle]',        // 6
            '#7 Nowhere',            // 7
            '#2 (gold>>1?) Bad',     // 8
            'Text with <broken tag', // 9
            '§1',                    // 10
            '*A magic',              // 11
        ].join('\n'));
        expect(issues).toEqual([
            expect.stringMatching(/^1: Ignored line before the first section/),
            expect.stringMatching(/^3: Value is not a number/),
            expect.stringMatching(/^4: Unknown effect/),
            expect.stringMatching(/^5: Unknown task type/),
            expect.stringMatching(/^6: Unknown building type/),
            expect.stringMatching(/^8: Invalid choice condition/),
            expect.stringMatching(/^10: Duplicate section number §1/),
            expect.stringMatching(/^11: Invalid role selection/),
            expect.stringMatching(/^2: Unbalanced < > in section text/),
        ]);
    });

    test('a choice to a section that does not exist is not an issue', () => {
        expect(issuesFor('§1\nHi\n#7 End')).toEqual([]);
    });

    test('a tag may span several lines', () => {
        expect(issuesFor('§1\n<x?yes;\nno>')).toEqual([]);
    });

    test('extra spaces in effects are allowed', () => {
        const parser = new EventParser();
        const event = parser.parseText('§1\n[var   gold   5]\nHi');
        expect(parser.getIssues()).toEqual([]);
        expect(event.getSections()[0].getEffects()).toHaveLength(1);
    });

    test('text lines are kept as written, including blank lines between them', () => {
        const event = new EventParser().parseText('§1 First\nLine one\n\nSecond part.\n\n#2 Go\n§2\n\nx\n\n');
        expect(event.getSections()[0].getText()).toBe('First\nLine one\n\nSecond part.');
        expect(event.getSections()[1].getText()).toBe('x');
    });

    test('parsing twice with the same parser gives independent results', () => {
        const parser = new EventParser();
        const first = parser.parseText('§1\nA\n§2\nB');
        const second = parser.parseText('§1\nC');
        expect(first.getSections()).toHaveLength(2);
        expect(second.getSections()).toHaveLength(1);
    });
});

describe('DataModel rules', () => {
    test('a name cannot be both a number and a flag', () => {
        const dm = new DataModel();
        dm.set('reputation', 3);
        expect(() => dm.set('reputation', true)).toThrow(/Cannot set integer variable/);
        dm.set('metKing', true);
        expect(() => dm.set('metKing', 1)).toThrow(/Cannot set boolean variable/);
        expect(() => dm.adjust('metKing', 1)).toThrow(/Cannot set boolean variable/);
    });

    test('debug info is on', () => {
        expect(DataModel.isDebugMode()).toBe(true);
        const dm = new DataModel();
        expect(DebugFormatter.formatDebugInfo(dm)).toContain('food: 0');
    });
});

describe('Buildings', () => {
    test('construction pays the resource costs', () => {
        const dm = new DataModel();
        dm.set('wood', 12);
        new StartConstructionEffect('mine').takeEffect(dm);
        expect(dm.isBuildingUnderConstruction('mine')).toBe(true);
        expect(dm.get('wood')).toBe(2);
    });

    test('construction does not start without enough resources', () => {
        const dm = new DataModel();
        dm.set('wood', 4);
        expect(dm.startBuildingConstruction('farm', 7)).toBe(false);
        expect(dm.isBuildingUnderConstruction('farm')).toBe(false);
        expect(dm.get('wood')).toBe(4);
    });

    test('the same building cannot be started twice or rebuilt', () => {
        const dm = new DataModel();
        expect(dm.startBuildingConstruction('hall', 1)).toBe(true);
        expect(dm.startBuildingConstruction('hall', 1)).toBe(false);
        expect(dm.getBuildingsUnderConstruction()).toHaveLength(1);
        dm.nextDay();
        dm.updateDailyResources();
        expect(dm.isBuildingCompleted('hall')).toBe(true);
        expect(dm.startBuildingConstruction('hall', 1)).toBe(false);
    });

    test('farming, fishing, mining and crafting need their building', () => {
        const dm = new DataModel();
        dm.assignPersonToTask('Farmer', 'farming');
        dm.assignPersonToTask('Hunter', 'hunting');
        dm.updateDailyResources();
        expect(dm.get('food')).toBe(2); // hunting only

        dm.set('wood', 5);
        dm.startBuildingConstruction('farm', 1);
        dm.set('food', 0);
        dm.nextDay();
        dm.updateDailyResources();
        expect(dm.isBuildingCompleted('farm')).toBe(true);
        expect(dm.get('food')).toBe(5); // hunting 2 + farming 3
        expect(dm.canPerformTask('mining')).toBe(false);
    });
});

describe('GameLoop and startup', () => {
    const makeEvent = (label: string) => {
        const s = new Section(label, [], [new Choice('end', [], undefined)], [], 1);
        return new Event([s], s);
    };

    test('an unknown named event is not scheduled', () => {
        const g = new GameLoop();
        g.scheduleEventByName('no_such_event', 1);
        expect(g.getEventQueue()).toEqual([]);
    });

    test('a named event can be loaded from text/<name>.txt', () => {
        const g = new GameLoop();
        g.getDataModel().setCurrentDay(1);
        g.scheduleEventByName('intro', 2);
        expect(g.getEventQueue()).toEqual([{ day: 3, eventName: 'intro' }]);
    });

    test('an event registered after scheduling is used when it is due', () => {
        const g = new GameLoop();
        g.getDataModel().setCurrentDay(1);
        g.registerEvent('visit', makeEvent('first version'));
        g.scheduleEventByName('visit', 0);
        g.registerEvent('visit', makeEvent('second version'));
        g.next();
        expect(g.getCurrentDialog()?.getCurrentText()).toBe('second version');
    });

    test('Main starts the intro with starting resources', async () => {
        const main = new Main();
        await main.initialize();
        const g = main.getGameLoop();
        expect(g.getDataModel().getCurrentDay()).toBe(1);
        expect(g.getDataModel().get('food')).toBe(11); // 10 + [var food 1] in intro §1
        expect(g.getCurrentDialog()?.getCurrentText()).toContain('You are on a boat.');
    });
});
