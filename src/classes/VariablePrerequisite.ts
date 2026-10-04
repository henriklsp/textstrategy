import { DataModel } from './DataModel';
import { Prerequisite } from './Prerequisite';

// Supported comparison operators for variable prerequisites
type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!=' | null;

// A prerequisite that checks a variable's value in the DataModel
// Supports: (x?) - boolean is set, (gold>5?) - numeric comparison,
//           (gold 5?) - gold >= 5 (same form as the <gold 5?a;b> text conditional)
export class VariablePrerequisite extends Prerequisite {
    private readonly varName: string;
    private readonly operator: ComparisonOperator;
    private readonly compareValue: number | null;

    // Private constructor - use factory methods
    private constructor(varName: string, operator: ComparisonOperator | null, compareValue: number | null) {
        super(() => false); // Not used: isMet is overridden
        this.varName = varName;
        this.operator = operator;
        this.compareValue = compareValue;
    }

    // Factory method for boolean prerequisite (x?)
    public static createBoolean(varName: string): VariablePrerequisite {
        return new VariablePrerequisite(varName, null, null);
    }

    // Factory method for numeric prerequisite (gold>5?)
    public static createNumeric(varName: string, operator: ComparisonOperator, value: number): VariablePrerequisite {
        return new VariablePrerequisite(varName, operator, value);
    }

    // Check if this prerequisite is met using the given DataModel
    public isMet(dataModel: DataModel): boolean {
        try {
            if (this.operator === null && this.compareValue === null) {
                // Boolean check: variable must be set (true)
                return dataModel.isSet(this.varName);
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

    // Parse a prerequisite expression from text like "(x?)" or "(gold>5?)"
    // Returns the extracted display text and VariablePrerequisite, or null if no prerequisite
    public static parse(expression: string): { displayText: string; prerequisite: VariablePrerequisite } | null {
        // First, extract the part inside parentheses
        // Match: (content) rest
        const outerMatch = expression.match(/^\(([^)]+)\)\s*(.*)$/);
        if (!outerMatch) {
            return null;
        }

        const innerContent = outerMatch[1]; // e.g., "hasDoneIt?" or "gold>5?" or "wood 5"
        const displayText = outerMatch[2].trim();

        // The inner content should end with ? for most formats
        // But for space-separated format like "wood 5", the ? is optional
        
        let contentWithoutQuestion = innerContent;
        let hasQuestionMark = false;
        
        if (innerContent.endsWith('?')) {
            contentWithoutQuestion = innerContent.substring(0, innerContent.length - 1);
            hasQuestionMark = true;
        }

        // Now parse the content
        // Match: varName or varName>5 or varName>=5 etc.
        // Also: "gold 5" -> gold >= 5 (with or without trailing ?)
        const spaceMatch = contentWithoutQuestion.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(-?\d+)$/);
        if (spaceMatch) {
            return {
                displayText,
                prerequisite: VariablePrerequisite.createNumeric(spaceMatch[1], '>=', parseInt(spaceMatch[2], 10))
            };
        }
        const innerMatch = contentWithoutQuestion.match(/^([a-zA-Z_][a-zA-Z0-9_]*)([><=!]=?)?(\d*)$/);
        
        if (!innerMatch) {
            return null;
        }

        const varName = innerMatch[1];
        const operatorStr = innerMatch[2] || null;
        const valueStr = innerMatch[3];

        // Map operator string to our type
        const operatorMap: Record<string, ComparisonOperator> = {
            '>': '>',
            '>=': '>=' as ComparisonOperator,
            '<': '<',
            '<=': '<=' as ComparisonOperator,
            '==': '==' as ComparisonOperator,
            '!=': '!=' as ComparisonOperator,
        };

        const operator: ComparisonOperator | null = operatorStr ? (operatorStr in operatorMap ? operatorMap[operatorStr] : null) : null;

        if (operator === null && (valueStr === '' || valueStr === '0')) {
            // Boolean check: (x?)
            return {
                displayText,
                prerequisite: VariablePrerequisite.createBoolean(varName)
            };
        } else if (operator !== null && valueStr !== '') {
            // Numeric comparison: (gold>5?)
            const value = parseInt(valueStr, 10);
            return {
                displayText,
                prerequisite: VariablePrerequisite.createNumeric(varName, operator, value)
            };
        }

        return null;
    }
}
