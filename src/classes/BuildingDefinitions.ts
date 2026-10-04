// Central definitions for all building types in the game.
// Each building has resource costs, construction time, and effects.

export type ResourceCosts = {
    wood: number;
    copper: number;
    iron: number;
};

export interface BuildingDefinition {
    name: string;
    costs: ResourceCosts;
    daysToBuild: number;
    // Effects will be implemented later
    effects: string[]; // Placeholder for future effects
}

// All building definitions
const BUILDINGS: Record<string, BuildingDefinition> = {
    shelter: {
        name: 'Shelter',
        costs: { wood: 1, copper: 0, iron: 0 }, // Minimal cost for testing
        daysToBuild: 1,
        effects: []
    },
    hall: {
        name: 'Hall',
        costs: { wood: 0, copper: 0, iron: 0 }, // Early game building, no cost
        daysToBuild: 5,
        effects: ['can_recruit_warriors', 'increases_morale']
    },
    workshop: {
        name: 'Workshop',
        costs: { wood: 0, copper: 0, iron: 0 }, // Early game building, no cost
        daysToBuild: 3,
        effects: ['enables_crafting', 'tool_production']
    },
    farm: {
        name: 'Farm',
        costs: { wood: 5, copper: 0, iron: 0 },
        daysToBuild: 7,
        effects: ['increases_food_production', 'enables_farming']
    },
    mine: {
        name: 'Mine',
        costs: { wood: 10, copper: 0, iron: 0 },
        daysToBuild: 10,
        effects: ['enables_mining', 'iron_production', 'copper_production']
    },
    dock: {
        name: 'Dock',
        costs: { wood: 15, copper: 0, iron: 0 },
        daysToBuild: 8,
        effects: ['enables_fishing', 'enables_trade', 'boat_production']
    },
    storage: {
        name: 'Storage',
        costs: { wood: 8, copper: 0, iron: 0 },
        daysToBuild: 4,
        effects: ['reduces_resource_decay', 'increases_storage_capacity']
    }
};

// Building type - union of all building names
export type BuildingType = keyof typeof BUILDINGS;

// Static class to access building definitions
export class BuildingDefinitions {
    // Get all building definitions
    static getAll(): Record<BuildingType, BuildingDefinition> {
        return { ...BUILDINGS };
    }

    // Get a specific building definition by type
    static get(buildingType: BuildingType): BuildingDefinition {
        if (!BUILDINGS[buildingType]) {
            throw new Error(`Unknown building type: ${buildingType}`);
        }
        return BUILDINGS[buildingType];
    }

    // Get all building types
    static getTypes(): BuildingType[] {
        return Object.keys(BUILDINGS) as BuildingType[];
    }

    // Check if a building type is valid
    static isValidBuildingType(type: string): type is BuildingType {
        return type in BUILDINGS;
    }

    // Get the construction time for a building
    static getDaysToBuild(buildingType: BuildingType): number {
        return BUILDINGS[buildingType].daysToBuild;
    }

    // Get the resource costs for a building
    static getCosts(buildingType: BuildingType): ResourceCosts {
        return BUILDINGS[buildingType].costs;
    }

    // Check if a building can be afforded with given resources
    static canAfford(buildingType: BuildingType, wood: number, copper: number, iron: number): boolean {
        const costs = this.getCosts(buildingType);
        return wood >= costs.wood && copper >= costs.copper && iron >= costs.iron;
    }
}
