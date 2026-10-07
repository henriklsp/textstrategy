import { DataModel, TaskType, isTaskType, normalizeTaskName } from './DataModel';
import { Prerequisite } from './Prerequisite';

// Prerequisite that checks if a task can be performed (building requirements met)
export class CanDoTaskPrerequisite extends Prerequisite {
    private readonly taskType: TaskType;

    constructor(taskType: TaskType) {
        super(() => false); // Not used: isMet is overridden
        this.taskType = taskType;
    }

    public isMet(dataModel: DataModel): boolean {
        return dataModel.canPerformTask(this.taskType);
    }

    public getTaskType(): TaskType {
        return this.taskType;
    }

    // Parse a condition expression (without outer parentheses) like
    // "can fish" or "can mine". Returns the prerequisite, or null if no match.
    public static parseCondition(condition: string): CanDoTaskPrerequisite | null {
        // Match: can taskname
        const match = condition.match(/^can\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (!match) {
            return null;
        }

        // Try to normalize the task name
        try {
            const taskType = normalizeTaskName(match[1]);
            return new CanDoTaskPrerequisite(taskType);
        } catch (e) {
            return null;
        }
    }
}
