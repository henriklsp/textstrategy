// Factory for creating Effect objects from parsed text.
// Each effect type is registered with a keyword and a factory function.
import { Effect } from './Effect';
import { VarEffect } from './VarEffect';
import { BoolEffect } from './BoolEffect';
import { EventEffect } from './EventEffect';
import { SetChoiceEffect } from './SetChoiceEffect';
import { AssignTaskEffect } from './AssignTaskEffect';
import { StartConstructionEffect } from './StartConstructionEffect';
import { DataModel, isTaskType, TASK_TYPES } from './DataModel';
import { BuildingDefinitions } from './BuildingDefinitions';

export interface ParseIssue {
    line: number;
    message: string;
}

export class EffectFactory {
    // Parse an effect from text like "var gold +1" or "bool hasDoneIt true"
    // Returns the Effect object, or null if parsing fails.
    // Issues are collected in the provided array.
    public static parseEffect(effectContent: string, lineNumber: number, issues: ParseIssue[]): Effect | null {
        const parts = effectContent.split(/\s+/);
        const effectType = parts[0];
        const textField = parts[1];

        const fail = (message: string): null => {
            issues.push({ line: lineNumber, message: `${message}: [${effectContent}]` });
            return null;
        };

        switch (effectType) {
            case 'var': {
                if (parts.length < 3) return fail('Expected [var name value]');
                const value = parseFloat(parts[2]);
                if (isNaN(value)) return fail('Value is not a number');
                return new VarEffect(textField, value);
            }
            case 'bool': {
                if (parts.length < 3) return fail('Expected [bool name true|false]');
                const value = parts[2].toLowerCase();
                if (value !== 'true' && value !== 'false') return fail('Value must be true or false');
                return new BoolEffect(textField, value === 'true');
            }
            case 'event': {
                if (parts.length < 2) return fail('Expected [event name days]');
                const delay = parts.length >= 3 ? parseInt(parts[2], 10) : 0;
                if (isNaN(delay) || delay < 0) return fail('Delay must be a number of days');
                return new EventEffect(textField, delay);
            }
            case 'set': {
                // [set variableName=choice]
                if (parts.length < 2) return fail('Expected [set variableName=choice]');
                const setContent = parts.slice(1).join('=');
                const match = setContent.match(/^(\w+)\s*=\s*choice$/);
                if (!match) return fail('Expected [set variableName=choice]');
                const varName = match[1].toLowerCase();
                return new SetChoiceEffect(varName);
            }
            case 'task': {
                if (parts.length < 3) return fail('Expected [task role|<variable> tasktype|<variable>]');
                const personRef = textField;
                const taskRef = parts.slice(2).join(' ');

                // Allow either literal task types or variable references like <task>
                const isTaskVar = taskRef.startsWith('<') && taskRef.endsWith('>');
                if (!isTaskVar && !isTaskType(taskRef)) {
                    return fail(`Unknown task type (expected one of ${TASK_TYPES.join(', ')} or a <variable>)`);
                }

                return new AssignTaskEffect(personRef, taskRef);
            }
            case 'build': {
                if (parts.length < 2) return fail('Expected [build buildingtype]');
                if (!BuildingDefinitions.isValidBuildingType(textField)) {
                    return fail(`Unknown building type (expected one of ${BuildingDefinitions.getTypes().join(', ')})`);
                }
                return new StartConstructionEffect(textField);
            }
            default:
                return fail('Unknown effect');
        }
    }
}
