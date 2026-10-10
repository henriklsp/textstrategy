import { Person } from './Person';
import { TaskType, isTaskType } from './DataModel';

// Represents a trait requirement for a role
export class TraitRequirement {
    constructor(
        public readonly traitName: string,
        public readonly isNegative: boolean
    ) {}
}

// Represents a role selection requirement for dialog.
// Parsed from lines like *A: magic or *B: -magic or *C: magic, life
// Can also be task-based: *A: scavenge or *B: build
// When Dialog enters a Section with PersonSelections, it resolves them
// by finding the best overall assignment of Persons from DataModel's castOfCharacters.
export class PersonSelection {
    private readonly roleName: string;
    private readonly traitRequirements: TraitRequirement[];
    private readonly taskType: TaskType | null;

    constructor(roleName: string, traitRequirements: TraitRequirement[], taskType: TaskType | null = null) {
        this.roleName = roleName;
        this.traitRequirements = traitRequirements;
        this.taskType = taskType;
    }

    // Convenience constructor for single trait (backward compatibility)
    static createSingle(roleName: string, traitName: string, isNegative: boolean = false): PersonSelection {
        return new PersonSelection(roleName, [new TraitRequirement(traitName, isNegative)]);
    }

    // Constructor for task-based selection
    static createForTask(roleName: string, taskType: TaskType): PersonSelection {
        return new PersonSelection(roleName, [], taskType);
    }

    public getRoleName(): string {
        return this.roleName;
    }

    public getTraitRequirements(): TraitRequirement[] {
        return this.traitRequirements;
    }

    public getTaskType(): TaskType | null {
        return this.taskType;
    }

    public isTaskBased(): boolean {
        return this.taskType !== null;
    }

    // Calculate score for matching a Person to this selection
    // For trait-based selections: sums scores for all trait requirements
    // For task-based selections: returns simple score based on traits that help with the task
    // Scoring per trait:
    // - 10 points: perfect match (positive role to positive person OR negative role to negative person)
    // - 4 points: positive role to tertiary person
    // - -9 points: mismatch (positive to negative or negative to positive)
    // - -3 points: negative role to tertiary person
    // - 0 points: Person doesn't have this trait at all
    public calculateScore(person: Person): number {
        if (this.isTaskBased()) {
            // For task-based selection, use simple trait mapping
            return this.calculateTaskScore(person);
        }

        let totalScore = 0;
        for (const req of this.traitRequirements) {
            const traitType = person.getTraitType(req.traitName);

            if (traitType === null) {
                // Person doesn't have this trait at all - 0 points
                continue;
            }

            if (req.isNegative) {
                // Role requires negative trait
                switch (traitType) {
                    case "negative": totalScore += 10; break; // perfect match
                    case "tertiary": totalScore += -3; break; // negative role to tertiary
                    case "positive": totalScore += -9; break; // mismatch
                }
            } else {
                // Role requires positive trait
                switch (traitType) {
                    case "positive": totalScore += 10; break; // perfect match
                    case "tertiary": totalScore += 4; break;  // positive role to tertiary
                    case "negative": totalScore += -9; break; // mismatch
                }
            }
        }
        return totalScore;
    }

    // Simple task-based scoring: bonus for relevant traits
    private calculateTaskScore(person: Person): number {
        let score = 0;
        // Task-to-trait mapping for simple bonuses
        const traitBonuses: Partial<Record<TaskType, string[]>> = {
            scavenge: [],
            hunting: ['life', 'magic'],
            fishing: ['life', 'harmony'],
            farming: ['life'],
            woodcutting: [],
            mining: ['magic'],
            build: ['divinity'],
            craft: ['magic'],
            storage: ['harmony'],
            rest: ['life']
        };

        const relevantTraits = traitBonuses[this.taskType!] || [];
        for (const trait of relevantTraits) {
            const traitType = person.getTraitType(trait);
            if (traitType === 'positive') {
                score += 5;
            } else if (traitType === 'tertiary') {
                score += 2;
            }
        }

        return score;
    }

    // Parse a PersonSelection from text like "A: magic" or "B: -magic" or "C: magic, life" or "A: scavenge"
    // Supports up to two comma-separated trait requirements, or a single task type
    public static parse(text: string): PersonSelection | null {
        // Match pattern: RoleName: something
        const match = text.match(/^([A-Za-z]\w*):\s*(.+)$/);
        if (!match) {
            return null;
        }
        const roleName = match[1];
        const contentText = match[2].trim();

        // Check if this is a task-based selection (single word that is a valid task type)
        if (isTaskType(contentText)) {
            return new PersonSelection(roleName, [], contentText as TaskType);
        }

        // Otherwise treat as trait-based selection
        // Split by comma to get individual trait requirements
        const traitStrings = contentText.split(',').map(s => s.trim());

        if (traitStrings.length === 0 || traitStrings.length > 2) {
            return null;
        }

        const traitRequirements: TraitRequirement[] = [];
        for (const traitStr of traitStrings) {
            const isNegative = traitStr.startsWith('-');
            const traitName = isNegative ? traitStr.substring(1).trim() : traitStr.trim();

            if (traitName) {
                traitRequirements.push(new TraitRequirement(traitName, isNegative));
            }
        }

        if (traitRequirements.length === 0) {
            return null;
        }

        return new PersonSelection(roleName, traitRequirements);
    }
}
