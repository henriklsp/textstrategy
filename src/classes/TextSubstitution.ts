import { DataModel } from './DataModel';
import { Person } from './Person';

// What the substitution needs from the Dialog
export interface TextSubstitutionContext {
    readonly dataModel: DataModel;
    getPersonForRole(roleName: string): Person | undefined;
    // Pick an option index in [0, count) for the next random subsection (<?a;b>).
    // Called once per random subsection, in the order they appear in the text.
    pickRandom(count: number): number;
    // Get a captured choice variable value
    getChoiceVariable(variableName: string): string | undefined;
}

// Replaces variable subsections in dialog text with their current values.
// Only resolves <...> tags; the rest of the text (including line breaks) is returned unchanged.
// Tags can be nested, e.g. <x?<?a;b>;c>.
//
//   <A>             name of the person in role A
//   <food>          current value of numeric variable food
//   <food?>         value of food (numeric), or true/false for a boolean flag
//   <?a;b;c>        random pick of one option
//   <x?a;b>         a if x is "truthy" (flag set, or number not 0), else b
//   <x?a>           a if x is truthy, else nothing
//   <food 2?a;b>    a if food >= 2, else b
//
// Options are trimmed. Unknown tags are left as-is (visible) so mistakes are easy to spot.
export class TextSubstitution {
    private readonly context: TextSubstitutionContext;

    constructor(context: TextSubstitutionContext) {
        this.context = context;
    }

    public substitute(text: string): string {
        let output = '';
        let i = 0;
        while (i < text.length) {
            if (text[i] === '<') {
                const close = TextSubstitution.findClosing(text, i);
                if (close === -1) {
                    // Unbalanced: keep the rest literally
                    output += text.substring(i);
                    break;
                }
                output += this.substituteTag(text.substring(i + 1, close));
                i = close + 1;
            } else {
                output += text[i];
                i++;
            }
        }
        return output;
    }

    private substituteTag(inner: string): string {
        const questionMark = TextSubstitution.indexOfTopLevel(inner, '?');

        if (questionMark === -1) {
            // <A> or <food> or <task> (choice variable)
            const name = inner.trim();
            if (/^\w+$/.test(name)) {
                // Try role first (A, B, C, ...)
                const person = this.context.getPersonForRole(name);
                if (person) return person.getName();

                // Try choice variable (task, person, etc.)
                const choiceVar = this.context.getChoiceVariable(name);
                if (choiceVar !== undefined) return choiceVar;

                // Try numeric variable (rounded to whole number for display)
                const value = this.numericValue(name);
                if (value !== undefined) return Math.round(value).toString();
                
                // Variable not found - return error indicator that will be visible
                return `<ERROR: ${name} not found>`;
            }
            return `<${inner}>`;
        }

        const condition = inner.substring(0, questionMark).trim();
        const rest = inner.substring(questionMark + 1);
        const options = TextSubstitution.splitTopLevel(rest, ';').map(option => option.trim());
        const trueText = options[0] ?? '';
        const falseText = options[1] ?? '';

        // <?a;b;c> random pick
        if (condition === '') {
            return this.substitute(options[this.context.pickRandom(options.length)]);
        }

        // <food 2?a;b> numeric threshold (>=)
        const threshold = condition.match(/^(\w+)\s+(-?\d+)$/);
        if (threshold) {
            const value = this.numericValue(threshold[1]);
            const met = value !== undefined && value >= parseInt(threshold[2], 10);
            return this.substitute(met ? trueText : falseText);
        }

        if (/^\w+$/.test(condition)) {
            // <food?> display value (rounded to whole number)
            if (rest.trim() === '') {
                const value = this.numericValue(condition);
                if (value !== undefined) return Math.round(value).toString();
                return this.context.dataModel.isSet(condition) ? 'true' : 'false';
            }
            // <x?a;b> truthy check
            return this.substitute(this.isTruthy(condition) ? trueText : falseText);
        }

        return `<${inner}>`;
    }

    // A flag that is set, or a numeric variable that is not 0
    private isTruthy(name: string): boolean {
        if (this.context.dataModel.isSet(name)) return true;
        const value = this.numericValue(name);
        return value !== undefined && value !== 0;
    }

    // Numeric value, or undefined if the variable does not exist
    private numericValue(name: string): number | undefined {
        try {
            return this.context.dataModel.has(name) ? this.context.dataModel.get(name) : undefined;
        } catch (e) {
            // Variable access failed - return undefined so error tag is shown
            return undefined;
        }
    }

    // Index of the '>' matching the '<' at position start, or -1
    private static findClosing(text: string, start: number): number {
        let depth = 0;
        for (let k = start; k < text.length; k++) {
            if (text[k] === '<') depth++;
            else if (text[k] === '>') {
                depth--;
                if (depth === 0) return k;
            }
        }
        return -1;
    }

    // Index of ch outside any nested <...>, or -1
    private static indexOfTopLevel(text: string, ch: string): number {
        let depth = 0;
        for (let k = 0; k < text.length; k++) {
            if (text[k] === '<') depth++;
            else if (text[k] === '>') depth--;
            else if (text[k] === ch && depth === 0) return k;
        }
        return -1;
    }

    // Split on separator, ignoring separators inside nested <...>
    private static splitTopLevel(text: string, separator: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let current = '';
        for (const c of text) {
            if (c === '<') depth++;
            else if (c === '>') depth--;
            if (c === separator && depth === 0) {
                parts.push(current);
                current = '';
            } else {
                current += c;
            }
        }
        parts.push(current);
        return parts;
    }
}
