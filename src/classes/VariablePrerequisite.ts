import { DataModel } from './DataModel';
import { Prerequisite } from './Prerequisite';

// Supported comparison operators for variable prerequisites
type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

// A prerequisite that checks a variable's value in the DataModel.
// Parsed from condition expressions (see Prerequisite.parseCondition):
//   hasDoneIt    - truthy: boolean flag set, or numeric variable not 0
//   gold>5       - numeric comparison
//   gold 5       - gold >= 5 (same form as the <gold 5?a;b> text conditional)
export class VariablePrerequisite extends Prerequisite {
    private readonly varName: string;
    private readonly operator: ComparisonOperator | null;
    private readonly compareValue: number | null;

    // Private constructor - use factory methods
    private constructor(varName: string, operator: ComparisonOperator | null, compareValue: number | null) {
        super(() => false); // Not used: isMet is overridden
        this.varName = varName;
        this.operator = operator;
        this.compareValue = compareValue;
    }

    // Factory method for truthy prerequisite (x?)
    public static createBoolean(varName: string): VariablePrerequisite {
        return new VariablePrerequisite(varName, null, null);
    }

    // Factory method for numeric prerequisite (gold>5?)
    public static createNumeric(varName: string, operator: ComparisonOperator, value: number): VariablePrerequisite {
        return new VariablePrerequisite(varName, operator, value);
    }

    // Truthy check: a boolean flag that is set, or a numeric variable that is not 0.
    // Used by both choice prerequisites (hasDoneIt?) and text conditionals (<x?a;b>).
    public isMet(dataModel: DataModel): boolean {
        try {
            if (this.operator === null) {
                // Truthy check
                if (dataModel.isSet(this.varName)) return true;
                return dataModel.has(this.varName) && dataModel.get(this.varName) !== 0;
            } else {
                // Numeric comparison
                const varValue = dataModel.get(this.varName);
                const compareValue = this.compareValue as number;

                switch (this.operator) {
                    case '>': return varValue > compareValue;
                    case '>=': return varValue >= compareValue;
                    case '<': return varValue < compareValue;
                    case '<=': return varValue <= compareValue;
                    case '==': return varValue == compareValue;
                    case '!=': return varValue != compareValue;
                    default: return false;
                }
            }
        } catch (e) {
            // Variable doesn't exist or error - prerequisite not met
            // Log the error for debugging but don't throw
            console.warn(`Prerequisite check failed for '${this.varName}': ${e}`);
            return false;
        }
    }

    // Parse a condition expression (without outer parentheses; trailing '?'
    // already stripped by Prerequisite.parseCondition) like "x", "gold>5",
    // "gold>=5" or "gold 5". Returns the prerequisite, or null if no match.
    public static parseCondition(condition: string): VariablePrerequisite | null {
        // "gold 5" -> gold >= 5 (space-separated threshold)
        const spaceMatch = condition.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(-?\d+)$/);
        if (spaceMatch) {
            return VariablePrerequisite.createNumeric(spaceMatch[1], '>=', parseInt(spaceMatch[2], 10));
        }

        // "x", "x>5", "x>=5", "x<5", ...
        const innerMatch = condition.match(/^([a-zA-Z_][a-zA-Z0-9_]*)([><=!]=?)?(-?\d*)$/);
        if (!innerMatch) {
            return null;
        }

        const varName = innerMatch[1];
        const operatorStr = innerMatch[2] || null;
        const valueStr = innerMatch[3];

        const operatorMap: Record<string, ComparisonOperator> = {
            '>': '>',
            '>=': '>=',
            '<': '<',
            '<=': '<=',
            '==': '==',
            '!=': '!=',
        };

        const operator: ComparisonOperator | null = operatorStr ? (operatorStr in operatorMap ? operatorMap[operatorStr] : null) : null;

        if (operator === null && valueStr === '') {
            // Truthy check: (x?)
            return VariablePrerequisite.createBoolean(varName);
        } else if (operator !== null && valueStr !== '') {
            // Numeric comparison: (gold>5?)
            return VariablePrerequisite.createNumeric(varName, operator, parseInt(valueStr, 10));
        }

        return null;
    }
}
