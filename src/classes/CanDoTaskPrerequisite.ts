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

    // Parse a prerequisite from text like "can fish" or "can mine" (without outer parentheses)
    // Returns the extracted display text and CanDoTaskPrerequisite, or null if no match
    public static parse(expression: string): { displayText: string; prerequisite: CanDoTaskPrerequisite } | null {
        // Match: can taskname
        const match = expression.match(/^can\s+(\w+)\s*(.*)$/);
        if (!match) {
            return null;
        }

        const taskName = match[1].trim();
        const displayText = match[2].trim();

        // Try to normalize the task name
        try {
            const taskType = normalizeTaskName(taskName);
            return {
                displayText,
                prerequisite: new CanDoTaskPrerequisite(taskType)
            };
        } catch (e) {
            return null;
        }
    }
}
