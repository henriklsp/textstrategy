import * as path from 'path';
import * as fs from 'fs';

// Style lint for intro.txt, mirroring firstday's stage-6 lint: patterns come
// from intro's own 2026-11-26 audit, not from firstday's. The narration
// (no comments, no quoted speech - characters may say these things) must not
// contain: 'like' similes, topic-summarized speech (described instead of
// quoted), narrator mind-reading of a child's belief, or the narrator's-ledger
// summary sentences purged from firstday.
describe("intro style: narration lint", () => {
    test('no like-simile, mind-read belief, summarized speech or ledger lines in narration', () => {
        const raw = fs.readFileSync(path.join(__dirname, '..', 'text', 'intro.txt'), 'utf8');
        const narration = raw
            .split('\n')
            .filter(line => !line.trimStart().startsWith('//'))
            .join('\n')
            .replace(/"[^"]*"/g, '');
        // 'like' simile constructions (the §12 'like doubt' and §67 'like an oar' purges)
        expect(narration).not.toMatch(/\blike (a|an|the|his|their|its|what)\b/);
        // narrator mind-reading of a background child's belief (the §14 purge)
        expect(narration.includes('believes it')).toBe(false);
        // speech summarized as a topic list instead of quoted (the §13/§33 purges)
        expect(narration).not.toMatch(/\b(talk|talking)\b[^<>\n]{0,20}:/);
        // the narrator's-ledger patterns purged from firstday cannot migrate in
        const ledgerPatterns = [
            'The friends do not agree',
            'The friends agree',
            'The friends cannot agree',
            'The day goes to',
            'The whole day goes',
            'The work divides',
            'The rest of the day is set out',
            'the day settles around'
        ];
        for (const pattern of ledgerPatterns) {
            expect(narration.includes(pattern)).toBe(false);
        }
    });
});
