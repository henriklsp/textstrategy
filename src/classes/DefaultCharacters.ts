import { Person, Gender } from './Person';

// Factory function to create default characters.
// Each call creates new Person objects; games don't share the same objects.
export function createDefaultCharacters(): Person[] {
    const p1 = new Person('Bearn', 'harmony', 'life', 'magic', 'male');
    const p2 = new Person('Arik', 'divinity', 'harmony', 'life', 'male');
    const p3 = new Person('Eya', 'magic', 'divinity', 'life', 'female');
    const p4 = new Person('Agnar', 'life', 'divinity', 'harmony', 'male');
    const p5 = new Person('Elrid', 'divinity', 'magic', 'harmony', 'male');
    return [p1, p2, p3, p4, p5];
}

// Deprecated: use createDefaultCharacters() instead.
// Kept for backward compatibility; creates a single shared set.
const defaultCharacters: Person[] = createDefaultCharacters();

export { defaultCharacters };
export default defaultCharacters;
