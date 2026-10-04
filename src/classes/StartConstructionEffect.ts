import { Effect } from './Effect';
import { DataModel } from './DataModel';
import { BuildingType, BuildingDefinitions } from './BuildingDefinitions';

// Starts construction of a building, paying its resource costs.
// Does nothing if the building already exists, is under construction, or cannot be afforded.
// Construction time is calculated dynamically based on workers assigned to the build task.
export class StartConstructionEffect implements Effect {
    private readonly buildingType: BuildingType;

    constructor(buildingType: BuildingType) {
        this.buildingType = buildingType;
    }

    public takeEffect(dataModel: DataModel): void {
        const success = dataModel.startBuildingConstruction(this.buildingType);
        if (!success) {
            throw new Error(`Cannot start construction of '${this.buildingType}': may already be built, under construction, or resources insufficient`);
        }
    }

    public getBuildingType(): BuildingType {
        return this.buildingType;
    }
}
