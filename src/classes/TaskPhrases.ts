import { DataModel, TaskType } from './DataModel';

// Central definitions for how each task is described in prose.
// Used by WorkerReport to build clauses like "Ada is fishing."
// Add task-specific flavor here; keep phrases in present participle form
// ("is ___"), lowercase, without the subject or verb.
export class TaskPhrases {
    // Present participle phrase for a task, to follow "X is/are/am ...".
    // 'build' names the building currently under construction when there is one.
    public static getPhrase(taskType: TaskType, dataModel: DataModel): string {
        switch (taskType) {
            case 'scavenge':
                return 'scavenging';
            case 'hunting':
                return 'hunting';
            case 'fishing':
                return 'fishing';
            case 'farming':
                return 'farming';
            case 'woodcutting':
                return 'cutting wood';
            case 'mining':
                return 'mining';
            case 'build': {
                const construction = dataModel.getCurrentConstruction();
                return construction ? `building the ${construction}` : 'building';
            }
            case 'craft':
                return 'crafting';
            case 'storage':
                return 'storing goods';
            case 'rest':
                return 'resting';
        }
    }
}
