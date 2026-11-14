import { DataModel } from '../src/classes/DataModel';
import { Person } from '../src/classes/Person';
import { VolunteersEffect } from '../src/classes/VolunteersEffect';
import { EffectContext } from '../src/classes/Effect';

// Unit tests for [volunteers tasktype [count]]: the engine picks who works;
// story-wise the friends volunteer. Persons with the positive life trait
// always forage and are never picked for another task.

function modelWith(persons: Person[]): DataModel {
    const dataModel = new DataModel();
    for (const person of persons) {
        dataModel.addPerson(person);
    }
    return dataModel;
}

function contextOf(persons: Person[]): EffectContext {
    return { getRolePersons: () => persons } as EffectContext;
}

// A small cast: Ana has the positive life trait, the others do not
const ana = new Person('Ana', 'life', 'divinity', 'magic', 'female');
const bo = new Person('Bo', 'divinity', 'life', 'magic', 'male');
const cy = new Person('Cy', 'magic', 'divinity', 'life', 'female');
const de = new Person('De', 'harmony', 'magic', 'divinity', 'male');

describe('VolunteersEffect', () => {
    test('without a count, every free role person is assigned', () => {
        const dataModel = modelWith([ana, bo, cy, de]);
        new VolunteersEffect('scavenge').takeEffect(dataModel, contextOf([ana, bo, cy, de]));
        expect(dataModel.getPersonsForTask('scavenge')).toEqual(['Ana', 'Bo', 'Cy', 'De']);
    });

    test('persons with the life trait are never picked for other tasks', () => {
        const dataModel = modelWith([ana, bo, cy, de]);
        new VolunteersEffect('build', 2).takeEffect(dataModel, contextOf([ana, bo, cy, de]));
        // Only Bo and Cy volunteered; Ana (life) and De (no count room) keep resting
        expect(dataModel.getPersonsForTask('build')).toEqual(['Bo', 'Cy']);
        expect(dataModel.getTaskForPerson('Ana')).toBe('rest');
        expect(dataModel.getTaskForPerson('De')).toBe('rest');
    });

    test('already-assigned persons are not picked again', () => {
        const dataModel = modelWith([ana, bo, cy, de]);
        const context = contextOf([ana, bo, cy, de]);
        new VolunteersEffect('build', 1).takeEffect(dataModel, context);
        // Bo builds; the next call skips Bo and Ana (life), so Cy woodcuts
        new VolunteersEffect('woodcutting', 1).takeEffect(dataModel, context);
        expect(dataModel.getPersonsForTask('build')).toEqual(['Bo']);
        expect(dataModel.getPersonsForTask('woodcutting')).toEqual(['Cy']);
    });

    test('a count larger than the pool assigns everyone eligible', () => {
        const dataModel = modelWith([ana, bo, cy, de]);
        new VolunteersEffect('woodcutting', 5).takeEffect(dataModel, contextOf([ana, bo, cy, de]));
        expect(dataModel.getPersonsForTask('woodcutting')).toEqual(['Bo', 'Cy', 'De']);
        expect(dataModel.getTaskForPerson('Ana')).toBe('rest');
    });

    test('persons outside the roles are never touched', () => {
        const dataModel = modelWith([ana, bo, cy, de]);
        const outsider = new Person('Elrid', 'divinity', 'magic', 'harmony', 'male');
        dataModel.addPerson(outsider);
        new VolunteersEffect('scavenge').takeEffect(dataModel, contextOf([ana, bo, cy, de]));
        expect(dataModel.getPersonsForTask('scavenge')).toEqual(['Ana', 'Bo', 'Cy', 'De']);
        expect(dataModel.getTaskForPerson('Elrid')).toBe('rest');
    });

    test('throws when there are no role persons', () => {
        const dataModel = modelWith([ana]);
        expect(() => new VolunteersEffect('scavenge').takeEffect(dataModel, contextOf([])))
            .toThrow(/no role persons/);
    });
});
