// Tests for <task> as a captured choice variable in prose.
// <task> holds the chosen menu label ("Woodcutting"); when it is shown in
// event text it must render as the task's prose phrase ("cutting wood"),
// not the raw capitalized label. Values that do not name a task are shown
// unchanged.

import { TextSubstitution } from '../src/classes/TextSubstitution.ts';
import type { TextSubstitutionContext } from '../src/classes/TextSubstitution.ts';
import { DataModel } from '../src/classes/DataModel.ts';
import { createDefaultCharacters } from '../src/classes/DefaultCharacters.ts';

// Minimal context: choice variables captured by [set x=choice]
function makeContext(vars: Record<string, string>): TextSubstitutionContext {
    const dataModel = new DataModel();
    for (const person of createDefaultCharacters()) {
        dataModel.addPerson(person);
    }
    return {
        dataModel,
        getPersonForRole: () => null,
        getChoiceVariable: (name: string) => vars[name],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

describe('<task> choice variable rendering', () => {
    test('renders the prose phrase in a sentence, not the menu label', () => {
        const context = makeContext({ task: 'Woodcutting' });
        const sub = new TextSubstitution(context);
        expect(sub.substitute('will spend the day <task>.')).toBe('will spend the day cutting wood.');
    });

    test('renders prose for every task menu label', () => {
        const labels: [string, string][] = [
            ['Scavenging', 'scavenging'],
            ['Hunting', 'hunting'],
            ['Fishing', 'fishing'],
            ['Farming', 'farming'],
            ['Woodcutting', 'cutting wood'],
            ['Mining', 'mining'],
            ['Crafting', 'crafting'],
            ['Storage', 'storing goods'],
            ['Resting', 'resting'],
        ];
        for (const [label, phrase] of labels) {
            const context = makeContext({ task: label });
            const sub = new TextSubstitution(context);
            expect(sub.substitute('<task>')).toBe(phrase);
        }
    });

    test('renders "building the X" while a construction is running', () => {
        const context = makeContext({ task: 'Building' });
        context.dataModel.set('wood', 100);
        context.dataModel.set('copper', 100);
        context.dataModel.set('iron', 100);
        context.dataModel.startBuildingConstruction('workshop' as never);
        const sub = new TextSubstitution(context);
        expect(sub.substitute('<task>')).toBe('building the workshop');
    });

    test('shows a non-task value unchanged', () => {
        const context = makeContext({ task: 'Nothing for now.' });
        const sub = new TextSubstitution(context);
        expect(sub.substitute('<task>')).toBe('Nothing for now.');
    });

    test('other choice variables are unaffected', () => {
        const context = makeContext({ person: 'Bearn' });
        const sub = new TextSubstitution(context);
        expect(sub.substitute('<person> nods.')).toBe('Bearn nods.');
    });
});
