// Format debug information from DataModel for display
import { DataModel } from './DataModel';

export class DebugFormatter {
    public static formatDebugInfo(dataModel: DataModel): string {
        if (!DataModel.isDebugMode()) {
            return '';
        }

        const lines: string[] = [];

        // Known variables with their values (rounded to integers for display)
        for (const varName of dataModel.getKnownVariables()) {
            const value = dataModel.get(varName);
            lines.push(`${varName}: ${Math.round(value)}`);
        }

        // Boolean data (only shows true values since false = not set)
        for (const key of dataModel.getBooleanVariables()) {
            lines.push(`${key}: true`);
        }

        // Bounty system information
        const bounty = dataModel.getBounty();
        const replenishment = (dataModel as any).getBountyReplenishment();
        const scavengeProd = (dataModel as any).getScavengeProductionRate();
        lines.push(`bounty: ${Math.round(bounty)}`);
        lines.push(`bountyReplenish: ${Math.round(replenishment)}`);
        lines.push(`scavengeProd: ${Math.round(scavengeProd)}`);

        // Task assignments
        for (const assignment of dataModel.getTaskAssignmentsForDebug()) {
            lines.push(`task: ${assignment.personName}=${assignment.taskType}`);
        }

        // Buildings
        const { under, completed } = dataModel.getBuildingsForDebug();
        for (const building of under) {
            const daysLeft = building.daysToBuild - (dataModel.getCurrentDay() - building.startDay);
            lines.push(`building: ${building.buildingType} (${daysLeft} days left)`);
        }
        for (const building of completed) {
            lines.push(`building: ${building} (complete)`);
        }

        return lines.join(', ');
    }
}
