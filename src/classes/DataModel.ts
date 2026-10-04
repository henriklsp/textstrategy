import { Person } from './Person';
import { BuildingType, ResourceCosts, BuildingDefinition, BuildingDefinitions } from './BuildingDefinitions';

// Global state container. Key-value store using separate maps for numbers and booleans.
// A name is either a number or a boolean flag, never both.
// Known variables (resources and currentDay) default to 0 if not explicitly set.

// Resource variables can never go below 0
export const RESOURCES = ['food', 'gold', 'silver', 'weapons', 'population', 'iron', 'copper', 'wood'] as const;
export type Resource = typeof RESOURCES[number];
const RESOURCE_VARIABLES = new Set<string>(RESOURCES);

const KNOWN_VARIABLES = new Set<string>([...RESOURCES, 'currentDay']);

// Bounty system for scavenging
const MAX_BOUNTY = 10;
const MIN_BOUNTY = 0;
const MAX_REPLENISHMENT_RATE = 3.0;
const MIN_SCAVENGE_PRODUCTION = 0.2;
const MAX_SCAVENGE_PRODUCTION = 1.0;

// Debug info is always on during development
const DEBUG_MODE = true;

// Task types available in the game
export const TASK_TYPES = ['scavenge', 'hunting', 'fishing', 'farming', 'woodcutting', 'mining', 'build', 'craft', 'storage'] as const;
export type TaskType = typeof TASK_TYPES[number];

export function isTaskType(value: string): value is TaskType {
    return (TASK_TYPES as readonly string[]).includes(value);
}

// Normalize task name with fuzzy matching
// Accepts variations like "hunt", "Hunt", "hunter", "hunting" → "hunting"
export function normalizeTaskName(input: string): TaskType {
    const lower = input.toLowerCase().trim();

    // Exact match
    if (isTaskType(lower)) return lower as TaskType;

    // Prefix/fuzzy matching
    const taskMappings: Record<string, TaskType> = {
        'hunt': 'hunting',
        'hunter': 'hunting',
        'fish': 'fishing',
        'fisher': 'fishing',
        'farm': 'farming',
        'farmer': 'farming',
        'wood': 'woodcutting',
        'woodcut': 'woodcutting',
        'mine': 'mining',
        'miner': 'mining',
        'build': 'build',
        'craft': 'craft',
        'scav': 'scavenge',
        'scavenge': 'scavenge',
        'storage': 'storage',
    };

    if (taskMappings[lower]) {
        return taskMappings[lower];
    }

    // No match found
    throw new Error(`Invalid task name: '${input}'. Valid tasks are: ${TASK_TYPES.join(', ')}`);
}

// Re-export BuildingType from BuildingDefinitions
export { BuildingType, ResourceCosts, BuildingDefinition, BuildingDefinitions };

// Information about a building under construction
interface BuildingConstruction {
    buildingType: BuildingType;
    startDay: number;
    daysToBuild: number;
}

// Tasks that only produce when a completed building provides the given capability
// (see the effects in BuildingDefinitions)
const TASK_REQUIRES: Partial<Record<TaskType, string>> = {
    farming: 'enables_farming',
    fishing: 'enables_fishing',
    mining: 'enables_mining',
    craft: 'enables_crafting'
};

// Default task when person is unassigned
export const DEFAULT_TASK: TaskType = 'scavenge';

// Information about a task assignment
interface TaskAssignment {
    personName: string;
    taskType: TaskType;
}

export interface SerializedDataModel {
    numericData: [string, number][];
    booleanData: string[];
    cast: ReturnType<Person['toJSON']>[];
    taskAssignments: TaskAssignment[];
    buildingsUnderConstruction: BuildingConstruction[];
    completedBuildings: BuildingType[];
}

export class DataModel {
    private numericData: Map<string, number>;
    private booleanData: Set<string>;
    private castOfCharacters: Person[];
    private taskAssignments: TaskAssignment[];
    private buildingsUnderConstruction: BuildingConstruction[];
    private completedBuildings: Set<BuildingType>;

    constructor() {
        this.numericData = new Map<string, number>();
        this.booleanData = new Set<string>();
        this.castOfCharacters = [];
        this.taskAssignments = [];
        this.buildingsUnderConstruction = [];
        this.completedBuildings = new Set<BuildingType>();
    }

    // Add a Person to the cast of available characters
    public addPerson(person: Person): void {
        this.castOfCharacters.push(person);
    }

    // Get all Persons in the cast
    public getCast(): Person[] {
        return this.castOfCharacters;
    }

    // Remove a Person from the cast
    public removePerson(person: Person): boolean {
        const index = this.castOfCharacters.indexOf(person);
        if (index !== -1) {
            this.castOfCharacters.splice(index, 1);
            return true;
        }
        return false;
    }

    public set(name: string, value: number | boolean): void {
        if (typeof value === 'boolean') {
            if (KNOWN_VARIABLES.has(name)) {
                throw new Error(`Cannot set known numeric variable '${name}' to boolean`);
            }
            if (this.numericData.has(name)) {
                throw new Error(`Cannot set numeric variable '${name}' to boolean`);
            }
            if (value) {
                this.booleanData.add(name);
            } else {
                this.booleanData.delete(name);
            }
        } else {
            this.assertNotFlag(name);
            this.numericData.set(name, this.clamp(name, value));
        }
    }

    private assertNotFlag(name: string): void {
        if (this.booleanData.has(name)) {
            throw new Error(`Cannot set boolean flag '${name}' as numeric variable`);
        }
    }

    // Resources are clamped so they cannot go below 0
    private clamp(name: string, value: number): number {
        return RESOURCE_VARIABLES.has(name) ? Math.max(0, value) : value;
    }

    public get(name: string): number {
        if (!this.numericData.has(name)) {
            if (KNOWN_VARIABLES.has(name)) {
                return 0;
            }
            throw new Error(`Numeric variable '${name}' is not defined`);
        }
        return this.numericData.get(name) as number;
    }

    // True if name is a numeric variable (set, or a known variable that defaults to 0)
    public has(name: string): boolean {
        return this.numericData.has(name) || KNOWN_VARIABLES.has(name);
    }

    public isSet(name: string): boolean {
        return this.booleanData.has(name);
    }

    // Adjust a numeric variable; an unknown variable starts at 0
    public adjust(name: string, delta: number): void {
        this.assertNotFlag(name);
        const current = this.numericData.has(name) ? (this.numericData.get(name) as number) : 0;
        const newValue = current + delta;
        if (!isFinite(newValue)) {
            throw new Error(`Adjusting '${name}' by ${delta} results in non-finite value`);
        }
        this.numericData.set(name, this.clamp(name, newValue));
    }

    // Get current day
    public getCurrentDay(): number {
        return this.numericData.has('currentDay') ? (this.numericData.get('currentDay') as number) : 0;
    }

    // Set current day
    public setCurrentDay(day: number): void {
        this.numericData.set('currentDay', day);
    }

    // Advance to next day
    public nextDay(): void {
        const currentDay = this.getCurrentDay();
        this.setCurrentDay(currentDay + 1);
    }

    // Assign a person (by person name) to a task.
    // Dialog roles (A, B, ...) must be resolved to a Person before calling this.
    public assignPersonToTask(personName: string, taskType: TaskType): void {
        // Remove any existing assignment for this person
        this.taskAssignments = this.taskAssignments.filter(a => a.personName !== personName);
        // Add new assignment
        this.taskAssignments.push({ personName, taskType });
    }

    // Get all task assignments
    public getTaskAssignments(): TaskAssignment[] {
        return [...this.taskAssignments];
    }

    // Get task for a specific person by name
    public getTaskForPerson(personName: string): TaskType | null {
        const assignment = this.taskAssignments.find(a => a.personName === personName);
        return assignment ? assignment.taskType : null;
    }

    // Get persons assigned to a specific task
    public getPersonsForTask(taskType: TaskType): string[] {
        return this.taskAssignments
            .filter(a => a.taskType === taskType)
            .map(a => a.personName);
    }

    // Assign all unassigned people to the default task
    public assignUnassignedToDefaultTask(): void {
        const assignedNames = new Set(this.taskAssignments.map(a => a.personName));
        for (const person of this.castOfCharacters) {
            if (!assignedNames.has(person.getName())) {
                this.assignPersonToTask(person.getName(), DEFAULT_TASK);
            }
        }
    }

    // Start construction of a building. Pays the building's resource costs.
    // Returns false (and changes nothing) if the building is already built or under
    // construction, or if the resources are not available.
    // daysToBuild is stored as the base value; actual completion time depends on workers assigned to the build task.
    public startBuildingConstruction(buildingType: BuildingType, daysToBuild?: number): boolean {
        if (this.isBuildingCompleted(buildingType) || this.isBuildingUnderConstruction(buildingType)) {
            console.warn(`Building '${buildingType}' is already built or under construction`);
            return false;
        }
        const costs = BuildingDefinitions.getCosts(buildingType);
        if (!BuildingDefinitions.canAfford(buildingType, this.get('wood'), this.get('copper'), this.get('iron'))) {
            console.warn(`Cannot afford building '${buildingType}'`);
            return false;
        }
        this.adjust('wood', -costs.wood);
        this.adjust('copper', -costs.copper);
        this.adjust('iron', -costs.iron);

        // Use provided daysToBuild, or default from BuildingDefinitions if not provided
        const baseDaysToBuild = daysToBuild !== undefined && daysToBuild > 0
            ? daysToBuild
            : BuildingDefinitions.getDaysToBuild(buildingType);

        this.buildingsUnderConstruction.push({
            buildingType,
            startDay: this.getCurrentDay(),
            daysToBuild: baseDaysToBuild
        });
        return true;
    }

    // Get buildings under construction
    public getBuildingsUnderConstruction(): BuildingConstruction[] {
        return [...this.buildingsUnderConstruction];
    }

    // Get completed buildings
    public getCompletedBuildings(): BuildingType[] {
        return Array.from(this.completedBuildings);
    }

    // Check if a building is completed
    public isBuildingCompleted(buildingType: BuildingType): boolean {
        return this.completedBuildings.has(buildingType);
    }

    // Complete a building by type
    public completeBuilding(buildingType: BuildingType): void {
        this.completedBuildings.add(buildingType);
        // Remove from under construction
        this.buildingsUnderConstruction = this.buildingsUnderConstruction.filter(
            b => b.buildingType !== buildingType
        );
    }

    // Check if a building is under construction
    public isBuildingUnderConstruction(buildingType: BuildingType): boolean {
        return this.buildingsUnderConstruction.some(b => b.buildingType === buildingType);
    }

    // Perform daily resource update
    public updateDailyResources(): void {
        const currentDay = this.getCurrentDay();

        // Step 1: Replenish bounty at the start of the day
        const replenishment = this.getBountyReplenishment();
        const currentBounty = this.getBounty();
        this.setBounty(currentBounty + replenishment);

        // Step 2: Process buildings under construction (copy: completeBuilding modifies the list)
        for (const building of [...this.buildingsUnderConstruction]) {
            const daysPassed = currentDay - building.startDay;
            // Calculate actual days needed based on workers assigned to build task
            const buildersCount = this.getPersonsForTask('build').length;
            const actualDaysToBuild = Math.max(1, Math.ceil(building.daysToBuild / Math.max(1, buildersCount)));

            if (daysPassed >= actualDaysToBuild) {
                this.completeBuilding(building.buildingType);
            }
        }

        // Step 3: Resource production based on task assignments
        // Track food produced by scavenging to reduce bounty
        let foodFromScavenging = 0;
        
        for (const assignment of this.taskAssignments) {
            if (!this.canPerformTask(assignment.taskType)) continue;
            const production = this.getDailyProductionForTask(assignment.taskType);
            
            // Track food from scavenging before applying
            if (assignment.taskType === 'scavenge' && production.food) {
                foodFromScavenging += production.food;
            }
            
            this.applyProduction(production);
        }

        // Step 4: Reduce bounty by food produced from scavenging (each unit reduces bounty by 1)
        // Bounty cannot go below 0
        if (foodFromScavenging > 0) {
            const newBounty = this.getBounty() - foodFromScavenging;
            this.setBounty(newBounty);
        }

        // Resource consumption (population eats food, etc.)
        this.applyConsumption();
    }

    // True if the task needs no building, or a completed building enables it
    public canPerformTask(taskType: TaskType): boolean {
        const required = TASK_REQUIRES[taskType];
        if (!required) return true;
        return this.getCompletedBuildings().some(b => BuildingDefinitions.get(b).effects.includes(required));
    }

    // Get daily production rates for each task type
    private getDailyProductionForTask(taskType: TaskType): Partial<Record<Resource, number>> {
        const production: Partial<Record<Resource, number>> = {};

        switch (taskType) {
            case 'scavenge':
                // Bounty-based production: varies from 0.2 to 1.0 based on bounty level
                production.food = this.getScavengeProductionRate();
                break;
            case 'hunting':
                production.food = 2;
                break;
            case 'fishing':
                production.food = 2;
                break;
            case 'farming':
                production.food = 3;
                break;
            case 'woodcutting':
                production.wood = 2;
                break;
            case 'mining':
                production.iron = 1;
                production.copper = 1;
                break;
            case 'build':
                // Build task doesn't produce resources directly
                // It enables buildings which enable other production
                break;
            case 'craft':
                // Craft produces tools/weapons
                production.weapons = 1;
                break;
            case 'storage':
                // Storage reduces resource loss
                break;
        }

        return production;
    }

    // Get the current bounty level
    public getBounty(): number {
        return this.numericData.has('bounty') ? (this.numericData.get('bounty') as number) : MAX_BOUNTY;
    }

    // Set bounty to a specific value (clamped to valid range)
    public setBounty(value: number): void {
        this.numericData.set('bounty', Math.max(MIN_BOUNTY, Math.min(MAX_BOUNTY, value)));
    }

    // Get scavenge production rate based on current bounty
    // At max bounty (10): 1.0 per scavenger per day
    // At min bounty (0): 0.2 per scavenger per day
    // Linear interpolation between these values
    private getScavengeProductionRate(): number {
        const bounty = this.getBounty();
        const bountyRatio = bounty / MAX_BOUNTY;
        return MIN_SCAVENGE_PRODUCTION + (bountyRatio * (MAX_SCAVENGE_PRODUCTION - MIN_SCAVENGE_PRODUCTION));
    }

    // Calculate daily bounty replenishment
    // At max bounty (10): +1.0 per day
    // At min bounty (0): +3.0 per day
    // Linear interpolation: the lower the bounty, the faster it replenishes
    private getBountyReplenishment(): number {
        const bounty = this.getBounty();
        const bountyRatio = bounty / MAX_BOUNTY;
        return MAX_REPLENISHMENT_RATE - (bountyRatio * (MAX_REPLENISHMENT_RATE - 1.0));
    }

    // Apply production to resources
    private applyProduction(production: Partial<Record<Resource, number>>): void {
        for (const [resource, amount] of Object.entries(production)) {
            if (amount !== undefined) {
                this.adjust(resource, amount);
            }
        }
    }

    // Apply daily consumption
    private applyConsumption(): void {
        const population = this.get('population');
        // Each person consumes 1 food per day
        this.adjust('food', -population);
        
        // Resource decay (unless we have storage)
        if (!this.isBuildingCompleted('storage')) {
            // Lose 10% of resources due to poor storage
            const food = this.get('food');
            const wood = this.get('wood');
            this.adjust('food', -Math.floor(food * 0.1));
            this.adjust('wood', -Math.floor(wood * 0.1));
        }
    }

    // Expose internal data for UI formatting (read-only interface)
    public getNumericVariables(): ReadonlyMap<string, number> {
        return this.numericData;
    }

    public getBooleanVariables(): ReadonlySet<string> {
        return this.booleanData;
    }

    public getKnownVariables(): ReadonlySet<string> {
        return KNOWN_VARIABLES;
    }

    public getTaskAssignmentsForDebug(): ReadonlyArray<{ personName: string; taskType: TaskType }> {
        return this.taskAssignments;
    }

    public getBuildingsForDebug(): { under: BuildingConstruction[]; completed: BuildingType[] } {
        return { under: this.buildingsUnderConstruction, completed: Array.from(this.completedBuildings) };
    }

    // Check if debug mode is enabled
    public static isDebugMode(): boolean {
        return DEBUG_MODE;
    }

    // Serializable representation of the full data model state
    public toJSON(): SerializedDataModel {
        return {
            numericData: Array.from(this.numericData.entries()),
            booleanData: Array.from(this.booleanData),
            cast: this.castOfCharacters.map(p => p.toJSON()),
            taskAssignments: this.taskAssignments.map(a => ({ ...a })),
            buildingsUnderConstruction: this.buildingsUnderConstruction.map(b => ({ ...b })),
            completedBuildings: Array.from(this.completedBuildings)
        };
    }

    // Restore state from its serialized form. Replaces all current content.
    public static fromJSON(data: SerializedDataModel): DataModel {
        const model = new DataModel();
        for (const [name, value] of data.numericData) {
            model.numericData.set(name, value);
        }
        for (const name of data.booleanData) {
            model.booleanData.add(name);
        }
        for (const personData of data.cast) {
            model.castOfCharacters.push(Person.fromJSON(personData));
        }
        for (const assignment of data.taskAssignments) {
            model.taskAssignments.push({ ...assignment });
        }
        for (const building of data.buildingsUnderConstruction) {
            model.buildingsUnderConstruction.push({ ...building });
        }
        for (const buildingType of data.completedBuildings) {
            model.completedBuildings.add(buildingType);
        }
        return model;
    }
}
