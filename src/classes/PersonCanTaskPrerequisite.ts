import { Prerequisite, PrerequisiteContext } from './Prerequisite';
import { Person } from './Person';
import { TaskType, normalizeTaskName } from './DataModel';

// Prerequisite that checks whether the Person assigned to a dialog role is
// available to take on a task: fit for work, not already doing it, and the
// task performable (building requirements, see DataModel.canPersonTakeTask).
// Parsed from condition expressions (see PrerequisiteParser.parseCondition):
//   D can fish  - the person in role D is available for the fishing task
// Also works in text conditionals: <D can fish?a;b>
// Not met if the role has no Person assigned.
export class PersonCanTaskPrerequisite extends Prerequisite {
    private readonly roleName: string;
    private readonly taskType: TaskType;

    constructor(roleName: string, taskType: TaskType) {
        super(() => false); // Not used: isMet is overridden
        this.roleName = roleName;
        this.taskType = taskType;
    }

    public getRoleName(): string {
        return this.roleName;
    }

    public getTaskType(): string {
        return this.taskType;
    }

    // The person in the role must be able to take this task now
    public isMet(context: PrerequisiteContext): boolean {
        const person = context.getPersonForRole(this.roleName);
        if (!person) {
            return false;
        }
        return context.dataModel.canPersonTakeTask(person, this.taskType);
    }

    // Parse a condition expression (without outer parentheses; trailing '?'
    // already stripped by PrerequisiteParser.parseCondition) like "D can fish".
    // Returns the prerequisite, or null if no match.
    public static parseCondition(condition: string): PersonCanTaskPrerequisite | null {
        // Role (a single letter, like the *A: person selection roles),
        // the keyword "can", and a task name (fuzzy, e.g. "fish" -> fishing)
        const match = condition.match(/^([A-Za-z])\s+can\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (!match) {
            return null;
        }

        try {
            const taskType = normalizeTaskName(match[2]);
            return new PersonCanTaskPrerequisite(match[1], taskType);
        } catch (e) {
            return null;
        }
    }
}
