import { Effect, EffectContext } from './Effect';
import { DataModel } from './DataModel';
import { BuildingType, BuildingDefinitions } from './BuildingDefinitions';

// Starts construction of a building, paying its resource costs.
// The building can be specified by:
//   - Literal building type (shelter, hall, workshop, farm, mine, dock, storage)
//   - Choice variable reference (<building>) from captured player choices,
//     e.g. [set building=choice] ... #2 Shelter ... [build <building>]
// Does nothing if the building already exists, is under construction, or cannot be afforded.
// Construction time is calculated dynamically based on workers assigned to the build task.
export class StartConstructionEffect implements Effect {
    private readonly buildingRef: string;    // building type or choice variable like <building>
    private readonly isVariableRef: boolean;

    constructor(buildingRef: string) {
        this.buildingRef = buildingRef;
        this.isVariableRef = buildingRef.startsWith('<') && buildingRef.endsWith('>');
        if (!this.isVariableRef && !BuildingDefinitions.isValidBuildingType(buildingRef)) {
            throw new Error(`Invalid building type: '${buildingRef}'`);
        }
    }

    public takeEffect(dataModel: DataModel, context?: EffectContext): void {
        // Resolve building reference
        let buildingType: BuildingType;
        if (this.isVariableRef) {
            const varName = this.buildingRef.slice(1, -1);
            const buildingText = context?.getChoiceVariable(varName);
            if (!buildingText) {
                throw new Error(`Choice variable '${varName}' was never set`);
            }
            const normalized = buildingText.trim().toLowerCase();
            if (!BuildingDefinitions.isValidBuildingType(normalized)) {
                throw new Error(`Invalid building type '${buildingText}' (expected one of ${BuildingDefinitions.getTypes().join(', ')})`);
            }
            buildingType = normalized;
        } else {
            buildingType = this.buildingRef as BuildingType;
        }

        const success = dataModel.startBuildingConstruction(buildingType);
        if (!success) {
            throw new Error(`Cannot start construction of '${buildingType}': may already be built, under construction, or resources insufficient`);
        }
    }

    // The building type for literal references, or null for choice variable references
    // (the building is only known when the effect takes place)
    public getBuildingType(): BuildingType | null {
        return this.isVariableRef ? null : (this.buildingRef as BuildingType);
    }

    public getBuildingRef(): string {
        return this.buildingRef;
    }
}
