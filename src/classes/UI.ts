import { Choice } from './Choice';

// A clickable option as shown on screen
export interface UIChoiceItem {
    text: string;
    onSelect: () => void;
}

// Page renderer defined in index.html: one entry per paragraph, displayed as plain text
// errors: array of error messages to display in red (debug mode only)
// Example implementation:
//   if (errors?.length) {
//       const errorDiv = document.createElement('div');
//       errorDiv.style.color = 'red';
//       errorDiv.style.marginTop = '1em';
//       errorDiv.textContent = 'ERRORS: ' + errors.join('\n');
//       container.appendChild(errorDiv);
//   }
type UpdateStoryFn = (paragraphs: string[], choices: UIChoiceItem[], debugInfo: string, errors?: string[]) => void;

declare global {
    interface Window {
        updateStory?: UpdateStoryFn;
    }
}

export interface UICallbacks {
    // The player picked one of the dialog's choices
    onChoiceSelected: (choice: Choice) => void;
    // The player moved on from a section that has no choices
    onContinue: () => void;
}

// Minimal interface for GameLoop to interact with UI.
// Decouples GameLoop from concrete UI implementation.
export interface IGameUI {
    // Show the current dialog text and choices
    // errors: optional array of error messages to display in red (debug mode)
    show(text: string, choices: Choice[], debugInfo: string, errors?: string[]): void;
}

// Label for moving on from a section without choices
const CONTINUE_TEXT = 'Continue';

// User interface. Owns all presentation decisions:
// - layout of the dialog text (a blank line separates paragraphs; other line breaks become spaces)
// - how to move on from a section without choices (a "Continue" option)
// - output to the page (index.html) or, outside a browser, to the console
export class UI implements IGameUI {
    private readonly isBrowser: boolean;
    private readonly callbacks: UICallbacks;

    constructor(callbacks: UICallbacks) {
        this.isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
        this.callbacks = callbacks;
    }

    // Split dialog text into paragraphs: blank lines separate paragraphs,
    // single line breaks within a paragraph become spaces.
    public static toParagraphs(text: string): string[] {
        return text
            .split(/\n\s*\n/)
            .map(paragraph => paragraph.split('\n').map(line => line.trim()).filter(line => line !== '').join(' '))
            .filter(paragraph => paragraph !== '');
    }

    // The options to show: the dialog's choices, or "Continue" if there are none
    public toChoiceItems(choices: Choice[]): UIChoiceItem[] {
        if (choices.length === 0) {
            return [{ text: CONTINUE_TEXT, onSelect: () => this.callbacks.onContinue() }];
        }
        return choices.map(choice => ({
            text: choice.getText(),
            onSelect: () => this.callbacks.onChoiceSelected(choice)
        }));
    }

    // Show the current dialog text and choices
    public show(text: string, choices: Choice[], debugInfo: string = '', errors: string[] = []): void {
        const paragraphs = UI.toParagraphs(text);
        const items = this.toChoiceItems(choices);
        if (this.isBrowser && typeof window.updateStory === 'function') {
            window.updateStory(paragraphs, items, debugInfo, errors);
        } else {
            console.log("UI: Text:", paragraphs.join('\n\n'));
            console.log("UI: Choices:", items.map(item => item.text));
            if (debugInfo) {
                console.log("DEBUG:", debugInfo);
            }
            if (errors.length > 0) {
                console.error("ERRORS:", errors.join('\n'));
            }
        }
    }

    // Deprecated: use show() instead
    public update(text: string, choices: Choice[], debugInfo: string = ''): void {
        this.show(text, choices, debugInfo);
    }
}
