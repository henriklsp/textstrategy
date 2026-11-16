import * as fs from 'fs';
import * as path from 'path';
import { EventParser } from '../src/classes/EventParser';

// Every section in every story file must contain at least 100 words of
// narrative text. Counted via the parser's Section.getText(), so // comment
// lines, [effect] lines, *role* headers, and #choice lines are excluded
// (the parser already separates them from the section's text). Substitution
// tags (<...>) are stripped before counting; variation arms count as written.

const textDir = path.join(__dirname, '..', 'text');

// pool.txt is a manifest, style-examples.txt is a style reference;
// subfolders (workinprogress/) are not story files.
const EXCLUDED = new Set(['pool.txt', 'style-examples.txt']);

const storyFiles = fs
    .readdirSync(textDir)
    .filter(name => name.endsWith('.txt') && !EXCLUDED.has(name))
    .filter(name => fs.statSync(path.join(textDir, name)).isFile());

function wordCount(text: string): number {
    const withoutTags = text.replace(/<[^>]*>/g, ' ');
    return (withoutTags.match(/\S+/g) || []).length;
}

describe('section length', () => {
    test('every section in every story file has at least 100 words', () => {
        expect(storyFiles.length).toBeGreaterThan(0);

        const tooShort: string[] = [];

        for (const file of storyFiles) {
            const parser = new EventParser();
            const event = parser.parseFileSync(path.join(textDir, file));
            for (const section of event.getSections()) {
                const words = wordCount(section.getText());
                if (words < 100) {
                    tooShort.push(`${file} §${section.getSectionNumber()}: ${words} words`);
                }
            }
        }

        // A failure lists every section that is too short, with its word count.
        if (tooShort.length > 0) {
            console.error('Sections with fewer than 100 words:');
            for (const s of tooShort) console.error('  ' + s);
        }
        expect(tooShort.join('\n')).toBe('');
    });
});
