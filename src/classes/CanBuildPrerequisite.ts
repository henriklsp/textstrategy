import { Prerequisite, PrerequisiteContext } from './Prerequisite';
import { BuildingType, BuildingDefinitions } from './BuildingDefinitions';

// Prerequisite that checks whether construction of a building could start right
// now. Parsed from condition expressions (see Prerequisite.parseCondition):
//   canbuild shelter   - met when the shelter can be ordered:
//                        not built, not under construction, nothing else under
//                        construction, resources available, other prerequisites met
// It delegates to DataModel.canStartConstruction(), the same check the engine
// uses, so dialog conditions and engine behavior can never disagree.
// Building names are case-insensitive. Combine with "not" for the opposite.
export class CanBuildPrerequisite extends Prerequisite {
    private readonly buildingType: BuildingType;

    private constructor(buildingType: BuildingType) {
        super(() => false); // Not used: isMet is overridden
        this.buildingType = buildingType;
    }

    public isMet(context: PrerequisiteContext): boolean {
        return context.dataModel.canStartConstruction(this.buildingType);
    }

    // Parse a condition expression (without outer parentheses; trailing '?'
    // already stripped by Prerequisite.parseCondition) like "canbuild shelter".
    // Returns the prerequisite, or null if no match.
    public static parseCondition(condition: string): CanBuildPrerequisite | null {
        const match = condition.trim().match(/^canbuild\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
        if (!match) {
            return null;
        }
        const normalized = match[1].toLowerCase();
        if (!BuildingDefinitions.isValidBuildingType(normalized)) {
            return null;
        }
        return new CanBuildPrerequisite(normalized as BuildingType);
    }
}
