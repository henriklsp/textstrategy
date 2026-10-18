import { DataModel, normalizeTaskName } from '../src/classes/DataModel';
import { Person } from '../src/classes/Person';
import { PersonSelection } from '../src/classes/PersonSelection';
import { RoleAssigner } from '../src/classes/RoleAssigner';
import { CanDoTaskPrerequisite } from '../src/classes/CanDoTaskPrerequisite';
import { PersonCanTaskPrerequisite } from '../src/classes/PersonCanTaskPrerequisite';
import { PrerequisiteParser } from '../src/classes/PrerequisiteParser';
import { PrerequisiteContext } from '../src/classes/Prerequisite';

// Tests for selecting a person for a task role (*E: fish etc.) and for the
// (can task) choice prerequisite.
//
// A person already doing the task, or too unhealthy to work, must not be
// chosen for the role. Someone free (resting or unassigned) and healthy is
// preferred. The (can task) prerequisite requires the task to be performable
// and at least one cast member fit for work who is not already doing it.

describe('Task role selection', () => {
    const makeModel = (people: Person[]): DataModel => {
        const dm = new DataModel();
        for (const p of people) dm.addPerson(p);
        return dm;
    };

    const context = (dm: DataModel): PrerequisiteContext => ({
        dataModel: dm,
        getPersonForRole: () => undefined
    });

    // Person without the divinity trait: forced rest threshold is the default 0.25
    const makePerson = (name: string): Person => new Person(name, 'life', 'magic', 'harmony');

    const pick = (dm: DataModel, task: string): Person => {
        const selection = PersonSelection.createForTask('E', normalizeTaskName(task));
        return RoleAssigner.findBestAssignment([selection], dm.getCast(), dm)[0];
    };

    test('does not pick a person already doing the task', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        dm.assignPersonToTask('A', 'fishing');
        expect(pick(dm, 'fish')).toBe(b);
    });

    test('prefers a resting person over one already working the task', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        dm.assignPersonToTask('A', 'fishing');
        dm.assignPersonToTask('B', 'rest');
        expect(pick(dm, 'fish')).toBe(b);
    });

    test('does not pick a person too unhealthy to work', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        a.setHealth(10); // 0.10 of max health, at/below the 0.25 forced rest threshold
        expect(dm.isFitForWork(a)).toBe(false);
        expect(pick(dm, 'fish')).toBe(b);
    });

    test('still resolves the role when every candidate is disqualified', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        a.setHealth(10);
        // Nobody qualifies, but the dialog must still be able to resolve role E
        expect(pick(dm, 'fish')).toBe(a);
    });

    test('prefers the healthiest person', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        a.setHealth(60);
        expect(pick(dm, 'fish')).toBe(b);
    });

    test('parses task names with and without fuzzy matching', () => {
        // Exact task type
        const exact = PersonSelection.parse('E: fishing');
        expect(exact?.isTaskBased()).toBe(true);
        expect(exact?.getTaskType()).toBe('fishing');
        // Council text uses shorthand: "E: fish", "E: woodcut"
        const short = PersonSelection.parse('E: fish');
        expect(short?.isTaskBased()).toBe(true);
        expect(short?.getTaskType()).toBe('fishing');
        expect(PersonSelection.parse('E: woodcut')?.getTaskType()).toBe('woodcutting');
        // A word that is neither task nor known trait parses as a trait selection
        const trait = PersonSelection.parse('E: zzz');
        expect(trait?.isTaskBased()).toBe(false);
    });

    test('works without a data model (trait scoring only)', () => {
        const a = makePerson('A');
        const selection = PersonSelection.createForTask('E', 'fishing');
        // No assignments to consult: scoring falls back to traits only
        expect(selection.calculateScore(a)).toBeGreaterThanOrEqual(0);
    });
});

describe('(can task) prerequisite', () => {
    const makeModel = (people: Person[]): DataModel => {
        const dm = new DataModel();
        for (const p of people) dm.addPerson(p);
        return dm;
    };

    const context = (dm: DataModel): PrerequisiteContext => ({
        dataModel: dm,
        getPersonForRole: () => undefined
    });

    const makePerson = (name: string): Person => new Person(name, 'life', 'magic', 'harmony');

    const canDo = (dm: DataModel, task: string): boolean => {
        const prereq = CanDoTaskPrerequisite.parseCondition(`can ${task}`);
        expect(prereq).not.toBeNull();
        return (prereq as CanDoTaskPrerequisite).isMet(context(dm));
    };

    test('met when a fit person is not already doing the task', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        dm.assignPersonToTask('A', 'scavenge');
        dm.assignPersonToTask('B', 'rest');
        expect(canDo(dm, 'scavenge')).toBe(true);
    });

    test('not met when everyone is already doing the task', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        dm.assignPersonToTask('A', 'scavenge');
        dm.assignPersonToTask('B', 'scavenge');
        expect(canDo(dm, 'scavenge')).toBe(false);
    });

    test('not met when the only free person is too unhealthy to work', () => {
        const a = makePerson('A');
        const b = makePerson('B');
        const dm = makeModel([a, b]);
        dm.assignPersonToTask('A', 'scavenge');
        b.setHealth(10);
        expect(canDo(dm, 'scavenge')).toBe(false);
    });

    test('met for tasks without building requirements (scavenge, rest)', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        // Unassigned means resting by default: available for scavenge, already resting
        expect(canDo(dm, 'scavenge')).toBe(true);
        expect(canDo(dm, 'rest')).toBe(false);
        dm.assignPersonToTask('A', 'scavenge');
        expect(canDo(dm, 'rest')).toBe(true);
    });

    test('building requirement still gates the task (fishing needs a dock)', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        expect(canDo(dm, 'fish')).toBe(false);
        dm.completeBuilding('dock');
        expect(canDo(dm, 'fish')).toBe(true);
    });

    test('not met for build when nothing is under construction', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        expect(canDo(dm, 'build')).toBe(false);
    });
});

describe('(role can task) prerequisite', () => {
    const makeModel = (people: Person[]): DataModel => {
        const dm = new DataModel();
        for (const p of people) dm.addPerson(p);
        return dm;
    };

    const makePerson = (name: string): Person => new Person(name, 'life', 'magic', 'harmony');

    // Context with the given person in role D
    const context = (dm: DataModel, person: Person | undefined): PrerequisiteContext => ({
        dataModel: dm,
        getPersonForRole: () => person
    });

    test('parses "role can task" conditions (fuzzy task names)', () => {
        const prereq = PrerequisiteParser.parseCondition('D can fish');
        expect(prereq).toBeInstanceOf(PersonCanTaskPrerequisite);
        expect((prereq as PersonCanTaskPrerequisite).getTaskType()).toBe('fishing');
        expect(PrerequisiteParser.parseCondition('D can scavenge')).toBeInstanceOf(PersonCanTaskPrerequisite);
        // Unknown task, missing keyword, or multi-letter role: not this prerequisite
        expect(PrerequisiteParser.parseCondition('D can nonsense')).toBeNull();
        expect(PrerequisiteParser.parseCondition('D will fish')).toBeNull();
        expect(PrerequisiteParser.parseCondition('DD can fish')).toBeNull();
        // No confusion with the other parsers
        expect(PrerequisiteParser.parseCondition('can fish')).toBeInstanceOf(CanDoTaskPrerequisite);
    });

    test('met for a fit person not already doing the task', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        const prereq = new PersonCanTaskPrerequisite('D', 'scavenge');
        expect(prereq.isMet(context(dm, a))).toBe(true);
    });

    test('not met when the person is already doing the task', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        dm.assignPersonToTask('A', 'scavenge');
        const prereq = new PersonCanTaskPrerequisite('D', 'scavenge');
        expect(prereq.isMet(context(dm, a))).toBe(false);
    });

    test('not met when the person is too unhealthy to work', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        a.setHealth(10); // at/below the 0.25 forced rest threshold
        const prereq = new PersonCanTaskPrerequisite('D', 'scavenge');
        expect(prereq.isMet(context(dm, a))).toBe(false);
    });

    test('building requirements gate the person condition too (fishing needs a dock)', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        const prereq = new PersonCanTaskPrerequisite('D', 'fishing');
        expect(prereq.isMet(context(dm, a))).toBe(false);
        dm.completeBuilding('dock');
        expect(prereq.isMet(context(dm, a))).toBe(true);
    });

    test('not met when the role has no person assigned', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        const prereq = new PersonCanTaskPrerequisite('D', 'scavenge');
        expect(prereq.isMet(context(dm, undefined))).toBe(false);
    });

    test('an exhausted person can still be told to rest (but not to work)', () => {
        const a = makePerson('A');
        const dm = makeModel([a]);
        dm.assignPersonToTask('A', 'scavenge');
        a.setHealth(10);
        const rest = new PersonCanTaskPrerequisite('D', 'rest');
        const work = new PersonCanTaskPrerequisite('D', 'scavenge');
        expect(rest.isMet(context(dm, a))).toBe(true);
        expect(work.isMet(context(dm, a))).toBe(false);
        // Already resting: nothing left to assign
        dm.assignPersonToTask('A', 'rest');
        expect(rest.isMet(context(dm, a))).toBe(false);
    });
});
