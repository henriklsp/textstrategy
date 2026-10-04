import { Effect, EffectContext } from './Effect';
import { DataModel, TaskType, isTaskType, normalizeTaskName } from './DataModel';
import { Person } from './Person';

// Assigns a person to a task.
// The person can be referenced by:
//   - Role name (A, B, C, etc.) from the current dialog
//   - Choice variable reference (<person>) from captured player choices
// The task can be specified by:
//   - Literal task type (hunting, fishing, etc.)
//   - Choice variable reference (<task>) from captured player choices
export class AssignTaskEffect implements Effect {
    private readonly personRef: string;  // role name or choice variable like <person>
    private readonly taskRef: string;    // task type or choice variable like <task>
    private isPersonVar: boolean;
    private isTaskVar: boolean;

    constructor(personRef: string, taskRef: string) {
        this.personRef = personRef;
        this.taskRef = taskRef;
        this.isPersonVar = personRef.startsWith('<') && personRef.endsWith('>');
        this.isTaskVar = taskRef.startsWith('<') && taskRef.endsWith('>');
    }

    public takeEffect(dataModel: DataModel, context?: EffectContext): void {
        // Resolve person reference
        let person: Person | undefined;
        if (this.isPersonVar) {
            const varName = this.personRef.slice(1, -1);
            const personName = context?.getChoiceVariable(varName);
            if (!personName) {
                throw new Error(`Choice variable '${varName}' was never set`);
            }
            person = dataModel.getCast().find(p => p.getName() === personName);
            if (!person) {
                throw new Error(`Person '${personName}' is not in the cast`);
            }
        } else {
            // Role-based (existing logic)
            person = context?.getPersonForRole(this.personRef);
            if (!person) {
                throw new Error(`No person assigned to role '${this.personRef}'`);
            }
        }

        // Resolve task reference
        let taskType: TaskType;
        if (this.isTaskVar) {
            const varName = this.taskRef.slice(1, -1);
            const taskText = context?.getChoiceVariable(varName);
            if (!taskText) {
                throw new Error(`Choice variable '${varName}' was never set`);
            }
            taskType = normalizeTaskName(taskText);
        } else {
            // Assume taskRef is already a valid task type
            if (!isTaskType(this.taskRef)) {
                throw new Error(`Invalid task type: '${this.taskRef}'`);
            }
            taskType = this.taskRef as TaskType;
        }

        dataModel.assignPersonToTask(person.getName(), taskType);
    }

    public getPersonRef(): string {
        return this.personRef;
    }

    public getTaskRef(): string {
        return this.taskRef;
    }
}
