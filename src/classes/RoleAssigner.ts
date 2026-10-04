// Assigns roles (A, B, C, ...) to Persons based on PersonSelection criteria.
// The algorithm finds the assignment with the highest total score.
import { Person } from './Person';
import { PersonSelection } from './PersonSelection';

export class RoleAssigner {
    // Find the assignment of Persons to roles with the highest total score.
    // Throws if there are more roles than characters available.
    // Cost grows as cast!/(cast-roles)!, which is small for a handful of roles and characters.
    public static findBestAssignment(selections: PersonSelection[], cast: Person[]): Person[] {
        if (selections.length > cast.length) {
            const roles = selections.map(s => s.getRoleName()).join(', ');
            throw new Error(
                `Cannot assign ${selections.length} roles (${roles}): only ${cast.length} character(s) available`
            );
        }

        if (selections.length === 0) {
            return [];
        }

        const scores = selections.map(selection => cast.map(person => selection.calculateScore(person)));
        const used = new Array<boolean>(cast.length).fill(false);
        const current: number[] = [];
        let best: number[] = [];
        let bestScore = -Infinity;

        const search = (role: number, score: number): void => {
            if (role === selections.length) {
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

        return best.map(p => cast[p]);
    }
}
