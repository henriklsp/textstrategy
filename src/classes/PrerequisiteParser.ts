import { Prerequisite } from './Prerequisite';
import { VariablePrerequisite } from './VariablePrerequisite';
import { CanDoTaskPrerequisite } from './CanDoTaskPrerequisite';
import { PersonTraitPrerequisite } from './PersonTraitPrerequisite';

// Single entry point for parsing condition expressions into Prerequisites.
// Used by both choice prerequisites ((cond) choice text, see EventParser)
// and text substitution conditionals (<cond?a;b>, see TextSubstitution).
//
// To add a new prerequisite type:
// 1. Subclass Prerequisite and implement isMet(context).
// 2. Add a static parseCondition(condition: string): YourPrerequisite | null
//    that returns the prerequisite when it recognizes the condition, else null.
// 3. Register it in the parsers list below.
// It then works for dialog choices, text substitution, and future event triggers alike.
export class PrerequisiteParser {
    // All known prerequisite parsers, tried in order.
    // Note: CanDoTaskPrerequisite must come before PersonTraitPrerequisite,
    // so "can fish" is not read as role "can" with trait "fish".
    private static readonly parsers: ((condition: string) => Prerequisite | null)[] = [
        VariablePrerequisite.parseCondition,
        CanDoTaskPrerequisite.parseCondition,
        PersonTraitPrerequisite.parseCondition,
    ];

    // Parse a condition expression (without parentheses or trailing '?')
    // into a Prerequisite, e.g. "hasDoneIt", "gold>5", "gold 5", "can fish",
    // "A life", "B -magic", "A ~divine" (person trait conditions).
    // The expression may end with an optional '?' (so choice content like
    // "hasDoneIt?" or "gold 5?" parses unchanged).
    // Returns null if no prerequisite type recognizes the expression.
    public static parseCondition(expression: string): Prerequisite | null {
        let content = expression.trim();
        if (content.endsWith('?')) {
            content = content.substring(0, content.length - 1);
        }

        for (const parser of PrerequisiteParser.parsers) {
            const prerequisite = parser(content);
            if (prerequisite !== null) {
                return prerequisite;
            }
        }
        return null;
    }
}
