import { EventParser } from '../src/classes/EventParser';
import { PersonSelection } from '../src/classes/PersonSelection';
import { DataModel } from '../src/classes/DataModel';
import { Dialog } from '../src/classes/Dialog';
import { Person } from '../src/classes/Person';
import { defaultCharacters } from '../src/classes/DefaultCharacters';

const noop = { onDialogEnd: () => {}, onDialogUpdated: () => {} };

// Two parser improvements:
// 1. A role line with no requirements (*D:) is valid: any person is equally
//    good for the role.
// 2. Choice prerequisites in parentheses are valid at the end of the choice
//    line as well as at the start. A trailing parenthetical that is not a
//    valid condition is kept as display text (no parse issue).
describe('Traitless role selections (*D:)', () => {
    test('parses a role line with empty requirements', () => {
        const selection = PersonSelection.parse('D:');
        expect(selection).not.toBeNull();
        expect(selection!.getRoleName()).toBe('D');
        expect(selection!.getTraitRequirements()).toEqual([]);
        expect(selection!.getTaskType()).toBeNull();
        expect(selection!.isTaskBased()).toBe(false);
    });

    test('every person scores the same for a traitless role', () => {
        const selection = PersonSelection.parse('D:')!;
        const alice = new Person('Alice', 'life', 'magic', 'harmony');
        const bob = new Person('Bob', 'divinity', 'life', 'magic');
        expect(selection.calculateScore(alice)).toBe(selection.calculateScore(bob));
    });

    test('a traitless role is assigned a person in a dialog', () => {
        const parser = new EventParser();
        const event = parser.parseText('*A: divinity\n*D:\n§1\nHello <A> and <D>.');
        expect(parser.getIssues()).toEqual([]);

        const dm = new DataModel();
        for (const person of defaultCharacters) dm.addPerson(person);
        const dialog = new Dialog(event, dm, noop);
        dialog.start();

        const roleA = dialog.getPersonForRole('A')!;
        const roleD = dialog.getPersonForRole('D')!;
        expect(roleA).toBeDefined();
        expect(roleD).toBeDefined();
        expect(roleD).not.toBe(roleA);
        expect(dialog.getCurrentText()).toBe(`Hello ${roleA.getName()} and ${roleD.getName()}.`);
    });

    test('a traitless role does not steal a person from a trait-matched role', () => {
        // Elrid is the only character with positive divinity AND negative magic,
        // so role A must keep getting Elrid even when the traitless role B is
        // listed first
        const parser = new EventParser();
        const event = parser.parseText('*B:\n*A: divinity, -magic\n§1\n<A> and <B>.');
        expect(parser.getIssues()).toEqual([]);

        const dm = new DataModel();
        for (const person of defaultCharacters) dm.addPerson(person);
        const dialog = new Dialog(event, dm, noop);
        dialog.start();

        expect(dialog.getPersonForRole('A')!.getName()).toBe('Elrid');
        expect(dialog.getPersonForRole('B')).toBeDefined();
        expect(dialog.getPersonForRole('B')!.getName()).not.toBe('Elrid');
    });

    test('a role line without a colon is still invalid', () => {
        expect(PersonSelection.parse('A magic')).toBeNull();
        const parser = new EventParser();
        parser.parseText('§1\nText\n*A magic\n');
        expect(parser.getIssues().map(i => i.message)).toContain('Invalid role selection \'*A magic\'');
    });

    test('text/intro.txt uses a traitless role for D and still assigns everyone', () => {
        const parser = new EventParser();
        const event = parser.parseFileSync('text/intro.txt');
        expect(parser.getIssues()).toEqual([]);

        const selections = event.getSections()[0].getPersonSelections();
        expect(selections.map(s => s.getRoleName())).toEqual(['A', 'B', 'C', 'D']);
        expect(selections[3].getTraitRequirements()).toEqual([]);
        expect(selections[3].getTaskType()).toBeNull();

        const dm = new DataModel();
        for (const person of defaultCharacters) dm.addPerson(person);
        const dialog = new Dialog(event, dm, noop);
        dialog.start();
        const names = ['A', 'B', 'C', 'D'].map(role => dialog.getPersonForRole(role)!.getName());
        expect(new Set(names).size).toBe(4);
    });
});

describe('Choice prerequisites at the end of the line', () => {
    const issuesFor = (text: string): string[] => {
        const parser = new EventParser();
        parser.parseText(text);
        return parser.getIssues().map(i => `${i.line}: ${i.message}`);
    };

    test('a trailing (cond?) group is a prerequisite, not display text', () => {
        const parser = new EventParser();
        const event = parser.parseText('§1\nHi\n#2 Search the surf (not broughtweapons)\n§2\nFound');
        expect(parser.getIssues()).toEqual([]);

        const choice = event.getSections()[0].getChoices()[0];
        expect(choice.getText()).toBe('Search the surf');
        expect(choice.getPrerequisites().length).toBe(1);

        const dm = new DataModel();
        const context = { dataModel: dm, getPersonForRole: () => undefined };
        expect(choice.arePrerequisitesMet(context)).toBe(true); // flag not set
        dm.set('broughtweapons', true);
        expect(choice.arePrerequisitesMet(context)).toBe(false);
    });

    test('a trailing numeric condition hides the choice until it is met', () => {
        const dm = new DataModel();
        const event = new EventParser().parseText('§1\nHi\n#2 Eat (food 2?)\n#2 Leave\n§2\nBye');
        const dialog = new Dialog(event, dm, noop);
        dialog.start();
        expect(dialog.getCurrentChoices().map(c => c.getText())).toEqual(['Leave']);
        dm.set('food', 2);
        expect(dialog.getCurrentChoices().map(c => c.getText())).toEqual(['Eat', 'Leave']);
    });

    test('leading and trailing groups combine; all must be met', () => {
        const parser = new EventParser();
        const event = parser.parseText('*A: divinity\n§1\nHi\n#2 (A divinity) Ask (food 1?)\n§2\nBye');
        expect(parser.getIssues()).toEqual([]);

        const choice = event.getSections()[0].getChoices()[0];
        expect(choice.getText()).toBe('Ask');
        expect(choice.getPrerequisites().length).toBe(2);
    });

    test('several trailing groups are all read', () => {
        const parser = new EventParser();
        const event = parser.parseText('§1\nHi\n#2 Build (wood 1?)(not built shelter)\n§2\nBye');
        expect(parser.getIssues()).toEqual([]);
        const choice = event.getSections()[0].getChoices()[0];
        expect(choice.getText()).toBe('Build');
        expect(choice.getPrerequisites().length).toBe(2);
    });

    test('a trailing parenthetical that is not a condition stays display text', () => {
        const parser = new EventParser();
        const event = parser.parseText('§1\nWhat next?\n#7 Build nothing yet (wood is needed for bigger buildings)\n§7\nNothing');
        expect(parser.getIssues()).toEqual([]);

        const choice = event.getSections()[0].getChoices()[0];
        expect(choice.getText()).toBe('Build nothing yet (wood is needed for bigger buildings)');
        expect(choice.getPrerequisites()).toEqual([]);
    });

    test('an invalid leading group is still reported (unchanged behavior)', () => {
        expect(issuesFor('§1\nHi\n#2 (gold>>1?) Bad')).toEqual(['3: Invalid choice condition \'(gold>>1?)\'']);
    });
});
