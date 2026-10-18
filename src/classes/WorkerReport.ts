import { DataModel, TaskType, TASK_TYPES } from './DataModel';
import { TaskPhrases } from './TaskPhrases';

// Generates prose about who is working on which task.
// Used by the text substitutions <working fish> and <taskreport>
// (see TextSubstitution.ts), so it can be used in any event text.
//
// Prose rules:
// - One clause per populated task, in TASK_TYPES order:
//     "Ada is fishing."  /  "Ada and Bea are fishing."
//     "Ada, Bea and Cal are scavenging."
// - The speaker (the person in the current dialog role) is referred to in
//   first person:  "I am fishing."  or  "Bea and I are fishing."
// - Large groups are aggregated to keep the prose readable at any cast size:
//     "Ada and 12 others are farming."
// - In a full report the speaker's own clause comes last, prefixed with "And ":
//     "Bea and Cal are scavenging. Dan is building the hall. And I am fishing."
// - Unassigned cast members are resting by default (DataModel), so a fresh
//   game renders as "Ada, Bea and Cal are resting."
// - <working fish> is empty when nobody is doing the task, so the surrounding
//   sentence must make sense without it. <taskreport> is empty only with an
//   empty cast.
export class WorkerReport {
    // Aggregate to "First and N others" once a group exceeds this many names.
    private static readonly MAX_NAMES = 5;

    // Clause about who is doing one task, e.g. <working fishing>.
    // speakerName: the name of the current dialog role's person, or null.
    public static workingClause(taskType: TaskType, dataModel: DataModel, speakerName: string | null): string {
        const names = dataModel.getPersonsForTask(taskType);
        if (names.length === 0) return '';
        return WorkerReport.clause(taskType, names, dataModel, speakerName);
    }

    // One clause per populated task, e.g. <taskreport>.
    // The speaker's own clause (if any) comes last, prefixed with "And ".
    public static taskReport(dataModel: DataModel, speakerName: string | null): string {
        const populated = TASK_TYPES.filter(taskType =>
            dataModel.getPersonsForTask(taskType).length > 0
        );
        if (populated.length === 0) return '';

        const ownTasks = speakerName
            ? populated.filter(taskType => dataModel.getPersonsForTask(taskType).includes(speakerName))
            : [];
        const otherTasks = populated.filter(taskType => !ownTasks.includes(taskType));

        const clauses: string[] = [];
        for (const taskType of otherTasks) {
            const names = dataModel.getPersonsForTask(taskType);
            clauses.push(WorkerReport.clause(taskType, names, dataModel, speakerName));
        }
        for (const taskType of ownTasks) {
            const names = dataModel.getPersonsForTask(taskType);
            const clause = WorkerReport.clause(taskType, names, dataModel, speakerName);
            // Flourish for multi-sentence reports: "... And I am fishing."
            clauses.push(clauses.length > 0 ? `And ${clause}` : clause);
        }
        return clauses.join(' ');
    }

    // "Subject is/are/am phrase." with list joining, first person for the
    // speaker, and aggregation for large groups.
    private static clause(taskType: TaskType, names: string[], dataModel: DataModel, speakerName: string | null): string {
        const phrase = TaskPhrases.getPhrase(taskType, dataModel);
        const others = names.filter(name => name !== speakerName);
        const includesSpeaker = others.length !== names.length;

        let subject: string;
        let verb: string;
        if (names.length > WorkerReport.MAX_NAMES) {
            // Lost in the crowd: aggregate over everyone, speaker included
            subject = `${names[0]} and ${names.length - 1} others`;
            verb = 'are';
        } else if (includesSpeaker) {
            if (others.length === 0) {
                subject = 'I';
                verb = 'am';
            } else {
                // Speaker joined into the list, last: "Eya and I", "Bea, Cal and I"
                subject = WorkerReport.joinNames([...others, 'I']);
                verb = 'are';
            }
        } else {
            subject = WorkerReport.joinNames(names);
            verb = names.length === 1 ? 'is' : 'are';
        }
        return `${WorkerReport.capitalize(subject)} ${verb} ${phrase}.`;
    }

    // Name list as a subject: "Ada", "Ada and Bea", "Ada, Bea and Cal".
    private static joinNames(names: string[]): string {
        if (names.length === 1) return names[0];
        return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }

    private static capitalize(text: string): string {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
}
