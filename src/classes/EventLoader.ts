// Handles loading event files with environment detection (browser vs Node.js)
export class EventLoader {
    private readonly isBrowser: boolean;

    constructor() {
        this.isBrowser = typeof window !== 'undefined';
    }

    public isBrowserEnvironment(): boolean {
        return this.isBrowser;
    }

    // Path of a named event file, e.g. "intro" -> text/intro.txt
    public eventPath(eventName: string): string {
        return this.isBrowser ? `/text/${eventName}.txt` : `text/${eventName}.txt`;
    }

    // Load a text file: fetch in the browser, file system in Node.
    // Returns the file content, or null if it cannot be read.
    public async load(filePath: string): Promise<string | null> {
        if (!this.isBrowser) {
            return this.loadSync(filePath);
        }
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return null;
        }
    }

    // Node only: synchronous file read. Returns null in the browser or on error.
    public loadSync(filePath: string): string | null {
        if (this.isBrowser) {
            console.warn("loadSync called in browser. Use load instead.");
            return null;
        }
        try {
            const fs = require('fs');
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return null;
        }
    }

    // Load and return a named event file
    public loadEvent(eventName: string): Promise<string | null> {
        return this.load(this.eventPath(eventName));
    }
}
