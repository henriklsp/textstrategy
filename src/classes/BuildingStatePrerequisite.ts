import { Prerequisite, PrerequisiteContext } from './Prerequisite';
import { BuildingType, BuildingDefinitions } from './BuildingDefinitions';

// Prerequisite that checks the state of buildings in the DataModel.
// Parsed from condition expressions (see Prerequisite.parseCondition):
//   built shelter       - true if the shelter has been completed
//   constructing        - true if any building is under construction
//   constructing mine   - true if the mine is under construction
// Building names are case-insensitive. Combine with "not": "not built shelter"
// is met while the shelter has not been completed, "not constructing" when
// nothing is being built.
export class BuildingStatePrerequisite extends Prerequisite {
    // null means: any building under construction ("constructing")
    private readonly buildingType: BuildingType | null;
    // true: check completed ("built x"); false: check under construction ("constructing x")
    private readonly checkCompleted: boolean;

    private constructor(buildingType: BuildingType | null, checkCompleted: boolean) {
        super(() => false); // Not used: isMet is overridden
        this.buildingType = buildingType;
        this.checkCompleted = checkCompleted;
    }

    public isMet(context: PrerequisiteContext): boolean {
        const dataModel = context.dataModel;
        if (this.buildingType === null) {
            return dataModel.getBuildingsUnderConstruction().length > 0;
        }
        return this.checkCompleted
            ? dataModel.isBuildingCompleted(this.buildingType)
            : dataModel.isBuildingUnderConstruction(this.buildingType);
    }

    // Parse a condition expression (without outer parentheses; trailing '?'
    // already stripped by Prerequisite.parseCondition) like
    // "built shelter", "constructing" or "constructing mine".
    // Returns the prerequisite, or null if no match.
    public static parseCondition(condition: string): BuildingStatePrerequisite | null {
        const trimmed = condition.trim();

        if (/^constructing$/i.test(trimmed)) {
            return new BuildingStatePrerequisite(null, false);
        }

        const withBuilding = trimmed.match(/^(built|constructing)\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
        if (withBuilding) {
            const normalized = withBuilding[2].toLowerCase();
            if (BuildingDefinitions.isValidBuildingType(normalized)) {
                return new BuildingStatePrerequisite(
                    normalized as BuildingType,
                    withBuilding[1].toLowerCase() === 'built'
                );
            }
        }

        return null;
    }
}
