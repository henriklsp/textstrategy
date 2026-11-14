import { Effect, EffectContext } from './Effect';
import { DataModel, TaskType } from './DataModel';
import { Person } from './Person';

// Assigns volunteers to a task: [volunteers tasktype [count]]
// Story-wise the friends volunteer; the engine picks who. The pool is the
// event's role persons who are not yet working on another task, in role order
// (A, B, C, ...). Persons with the positive life trait always forage: they are
// never picked for another task, and are always eligible for scavenge.
// Without a count, everyone still free is assigned.
export class VolunteersEffect implements Effect {
    private readonly task: TaskType;
    private readonly count: number | undefined;

    constructor(task: TaskType, count?: number) {
        this.task = task;
        this.count = count;
    }

    public takeEffect(dataModel: DataModel, context?: EffectContext): void {
        const rolePersons: Person[] = context?.getRolePersons?.() ?? [];
        if (rolePersons.length === 0) {
            throw new Error('[volunteers] cannot pick volunteers: no role persons in this dialog');
        }
        const free = rolePersons.filter(p => dataModel.getTaskForPerson(p.getName()) === 'rest');
        const pool = this.task === 'scavenge' ? free : free.filter(p => !p.hasPositiveTrait('life'));
        const n = this.count === undefined ? pool.length : Math.min(this.count, pool.length);
        for (const person of pool.slice(0, n)) {
            dataModel.assignPersonToTask(person.getName(), this.task);
        }
    }

    public getTask(): TaskType {
        return this.task;
    }

    public getCount(): number | undefined {
        return this.count;
    }
}
