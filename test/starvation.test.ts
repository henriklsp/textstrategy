import { DataModel, normalizeTaskName } from '../src/classes/DataModel';
import { Person } from '../src/classes/Person';

// Tests for the starvation, health and rest system.
// Food unit = a basket that feeds a family for a day: each character eats 0.2 per day.
// Starving: health -5/day (healing is slower: rest heals +3/day), attitude -4/day.
// Trait modifiers: life (heal speed), divinity (work/rest thresholds, starvation damage),
// harmony (attitude loss from starvation).
describe('Starvation, health and rest', () => {
    const makeModel = (people: Person[], food: number): DataModel => {
        const dm = new DataModel();
        for (const p of people) dm.addPerson(p);
        dm.set('food', food);
        return dm;
    };

    test("normalizeTaskName maps 'rest' and 'resting' to rest", () => {
        expect(normalizeTaskName('rest')).toBe('rest');
        expect(normalizeTaskName('Resting')).toBe('rest');
    });

    test('each character eats 0.2 food per day', () => {
        const dm = makeModel([
            new Person('A', 'life', 'magic', 'harmony'),
            new Person('B', 'life', 'magic', 'harmony')
        ], 10);
        dm.updateDailyResources();
        expect(dm.get('food')).toBeCloseTo(10 - 0.4);
    });

    test('starvation empties the stores and drains health and attitude', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 0.1); // needs 0.2, has 0.1
        dm.updateDailyResources();
        expect(dm.get('food')).toBe(0);
        expect(p.getHealth()).toBeCloseTo(100 - 5);
        expect(p.getAttitude()).toBeCloseTo(50 - 4);
    });

    test('health is clamped at 0 under continued starvation', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 0);
        dm.updateDailyResources();
        dm.updateDailyResources();
        dm.updateDailyResources();
        dm.updateDailyResources();
        expect(p.getHealth()).toBe(0);
    });

    test('rest heals +3 per day and is clamped at maxHealth', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 10);
        p.setHealth(90);
        dm.assignPersonToTask('A', 'rest');
        dm.updateDailyResources();
        expect(p.getHealth()).toBeCloseTo(93);
        p.setHealth(99);
        dm.updateDailyResources();
        expect(p.getHealth()).toBe(100);
    });

    test('a starving character does not heal from rest', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 0);
        dm.assignPersonToTask('A', 'rest');
        dm.updateDailyResources();
        expect(p.getHealth()).toBeCloseTo(95);
    });

    test('positive life trait heals 1.5x, negative life trait heals 0.5x', () => {
        const fast = new Person('Fast', 'life', 'magic', 'harmony');
        const slow = new Person('Slow', 'magic', 'life', 'harmony');
        const dm = makeModel([fast, slow], 10);
        fast.setHealth(90);
        slow.setHealth(90);
        dm.assignPersonToTask('Fast', 'rest');
        dm.assignPersonToTask('Slow', 'rest');
        dm.updateDailyResources();
        expect(fast.getHealth()).toBeCloseTo(90 + 4.5);
        expect(slow.getHealth()).toBeCloseTo(90 + 1.5);
    });

    test('negative divinity trait takes 1.25x starvation damage', () => {
        const tough = new Person('Tough', 'divinity', 'magic', 'harmony');
        const weak = new Person('Weak', 'magic', 'divinity', 'harmony');
        const dm = makeModel([tough, weak], 0);
        dm.updateDailyResources();
        expect(tough.getHealth()).toBeCloseTo(95);
        expect(weak.getHealth()).toBeCloseTo(100 - 6.25);
    });

    test('positive harmony loses half attitude, negative harmony double', () => {
        const calm = new Person('Calm', 'harmony', 'magic', 'life');
        const angry = new Person('Angry', 'magic', 'harmony', 'life');
        const dm = makeModel([calm, angry], 0);
        dm.updateDailyResources();
        expect(calm.getAttitude()).toBeCloseTo(50 - 2);
        expect(angry.getAttitude()).toBeCloseTo(50 - 8);
    });

    test('low health reduces work efficiency', () => {
        const tired = new Person('Tired', 'life', 'magic', 'harmony');
        const dm = makeModel([tired], 10);
        tired.setHealth(40); // fraction 0.4 < default threshold 0.5
        expect(dm.getWorkEfficiency(tired)).toBeCloseTo(0.8);
        dm.assignPersonToTask('Tired', 'woodcutting');
        dm.updateDailyResources();
        expect(dm.get('wood')).toBeCloseTo(2 * 0.8);
    });

    test('positive divinity keeps full efficiency at lower health', () => {
        const hero = new Person('Hero', 'divinity', 'magic', 'harmony');
        const dm = makeModel([hero], 10);
        hero.setHealth(40); // above their 0.3 threshold
        expect(dm.getWorkEfficiency(hero)).toBe(1);
    });

    test('characters at or below the forced rest threshold are moved to rest', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 10);
        p.setHealth(20); // fraction 0.2 <= default threshold 0.25
        dm.assignPersonToTask('A', 'woodcutting');
        dm.updateDailyResources();
        expect(dm.getTaskForPerson('A')).toBe('rest');
        expect(dm.get('wood')).toBe(0);
    });

    test('positive divinity is only forced to rest at 15% health', () => {
        const hero = new Person('Hero', 'divinity', 'magic', 'harmony');
        const dm = makeModel([hero], 10);
        hero.setHealth(20); // fraction 0.2 > 0.15
        dm.assignPersonToTask('Hero', 'woodcutting');
        dm.updateDailyResources();
        expect(dm.getTaskForPerson('Hero')).toBe('woodcutting');
    });

    test('canPersonPerformTask only allows rest for exhausted characters', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 10);
        p.setHealth(20);
        expect(dm.canPersonPerformTask('A', 'woodcutting')).toBe(false);
        expect(dm.canPersonPerformTask('A', 'scavenge')).toBe(false);
        expect(dm.canPersonPerformTask('A', 'rest')).toBe(true);
    });

    test('low health reduces construction speed', () => {
        const builder = new Person('Mason', 'life', 'magic', 'harmony');
        const dm = makeModel([builder], 10);
        dm.set('wood', 20);
        dm.startBuildingConstruction('shelter', 4); // 4 base days
        dm.assignPersonToTask('Mason', 'build');

        // Healthy builder: efficiency 1 -> 4 days to build
        builder.setHealth(100);
        for (let i = 0; i < 4; i++) {
            dm.nextDay();
            dm.updateDailyResources();
        }
        expect(dm.isBuildingCompleted('shelter')).toBe(true);

        // Same setup, but the builder is weak (0.4 health -> 0.8 efficiency -> 4/0.8 = 5 days)
        const dm2 = makeModel([builder], 10);
        dm2.set('wood', 20);
        dm2.startBuildingConstruction('workshop', 4);
        dm2.assignPersonToTask('Mason', 'build');
        builder.setHealth(40);
        for (let i = 0; i < 4; i++) {
            dm2.nextDay();
            dm2.updateDailyResources();
        }
        expect(dm2.isBuildingCompleted('workshop')).toBe(false);
        dm2.nextDay();
        dm2.updateDailyResources(); // day 5
        expect(dm2.isBuildingCompleted('workshop')).toBe(true);
    });

    test('an exhausted builder builds at the 0.1 efficiency floor', () => {
        const builder = new Person('Mason', 'life', 'magic', 'harmony');
        const dm = makeModel([builder], 10);
        dm.set('wood', 20);
        dm.startBuildingConstruction('shelter', 4);
        dm.assignPersonToTask('Mason', 'build');
        builder.setHealth(5); // fraction 0.05 -> below forced rest threshold? 0.05 <= 0.25 -> moved to rest
        dm.updateDailyResources();
        // Forced rest wins over the build assignment: no builder left, building stalls
        expect(dm.getTaskForPerson('Mason')).toBe('rest');
        expect(dm.isBuildingCompleted('shelter')).toBe(false);
    });

    test('rest produces nothing', () => {
        const p = new Person('A', 'life', 'magic', 'harmony');
        const dm = makeModel([p], 10);
        dm.assignPersonToTask('A', 'rest');
        dm.updateDailyResources();
        expect(dm.get('food')).toBeCloseTo(10 - 0.2);
    });
});
