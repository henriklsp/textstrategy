import { Prerequisite, PrerequisiteContext } from './Prerequisite';

// Comparison operators are not supported in syntax (only space syntax like "gold 5" for >=)
// >= is used internally for space syntax, but >, <, <=, ==, != are not supported in the source text
type ComparisonOperator = '>=';

// A prerequisite that checks a variable's value in the DataModel.
// Parsed from condition expressions (see Prerequisite.parseCondition):
//   hasDoneIt    - truthy: boolean flag set, or numeric variable not 0
//   gold 5       - gold >= 5 (space syntax; same form as the <gold 5?a;b> text conditional)
// Note: Comparison operators like >, >=, <, <=, ==, != are NOT supported in the syntax
// to avoid conflict with < and > characters used for text substitution tags.
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

    // Factory method for numeric prerequisite (used internally for space syntax: gold 5 -> >= 5)
    public static createNumeric(varName: string, operator: ComparisonOperator, value: number): VariablePrerequisite {
        return new VariablePrerequisite(varName, operator, value);
    }

    // Truthy check: a boolean flag that is set, or a numeric variable that is not 0.
    // Used by both choice prerequisites (hasDoneIt?) and text conditionals (<x?a;b>).
    public isMet(context: PrerequisiteContext): boolean {
        const dataModel = context.dataModel;
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
                    case '>=': return varValue >= compareValue;
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
    // already stripped by Prerequisite.parseCondition) like "x" or "gold 5".
    // Returns the prerequisite, or null if no match.
    // Note: Only space syntax (gold 5) and truthy (x) are supported; operators removed.
    public static parseCondition(condition: string): VariablePrerequisite | null {
        // "gold 5" -> gold >= 5 (space-separated threshold)
        const spaceMatch = condition.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(-?\d+)$/);
        if (spaceMatch) {
            return VariablePrerequisite.createNumeric(spaceMatch[1], '>=', parseInt(spaceMatch[2], 10));
        }

        // Only truthy checks (x) are supported here; space syntax (gold 5) is handled above
        // This regex only matches variable names for truthy checks
        const innerMatch = condition.match(/^([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (!innerMatch) {
            return null;
        }

        const varName = innerMatch[1];
        // No operators supported - only truthy checks
        return VariablePrerequisite.createBoolean(varName);

        return null;
    }
}
