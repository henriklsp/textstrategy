// Assigns roles (A, B, C, ...) to Persons based on PersonSelection criteria.
// The algorithm finds the assignment with the highest total score.
import { Person } from './Person';
import { PersonSelection } from './PersonSelection';
import { DataModel } from './DataModel';

export class RoleAssigner {
    // Find the assignment of Persons to roles with the highest total score.
    // If there are more roles than characters, assigns as many as possible (first N roles).
    // Returns an array matching selections.length: assigned Person or undefined for unassigned roles.
    // Cost grows as cast!/(cast-roles)!, which is small for a handful of roles and characters.
    // dataModel supplies current task assignments and health for task-based selections.
    public static findBestAssignment(selections: PersonSelection[], cast: Person[], dataModel: DataModel | null = null): (Person | undefined)[] {
        if (selections.length === 0) {
            return [];
        }

        // Assign as many roles as we have characters
        const assignableCount = Math.min(selections.length, cast.length);
        const limitedSelections = selections.slice(0, assignableCount);

        if (assignableCount === 0) {
            return selections.map(() => undefined);
        }

        const scores = limitedSelections.map(selection => cast.map(person => selection.calculateScore(person, dataModel)));
        const used = new Array<boolean>(cast.length).fill(false);
        const current: number[] = [];
        let best: number[] = [];
        let bestScore = -Infinity;

        const search = (role: number, score: number): void => {
            if (role === limitedSelections.length) {
                if (score > bestScore) {
                    bestScore = score;
                    best = [...current];
                }
                return;
            }
            for (let p = 0; p < cast.length; p++) {
                if (used[p]) continue;
                used[p] = true;
                current.push(p);
                search(role + 1, score + scores[role][p]);
                current.pop();
                used[p] = false;
            }
        };
        search(0, 0);

        // Return assignment for all selections: first assignableCount get real persons,
        // remaining selections get undefined (unassigned)
        const result: (Person | undefined)[] = new Array(selections.length);
        for (let i = 0; i < assignableCount; i++) {
            result[i] = best[i] !== undefined ? cast[best[i]] : undefined;
        }
        // Mark unassigned roles as undefined
        for (let i = assignableCount; i < selections.length; i++) {
            result[i] = undefined;
        }
        return result;
    }
}
