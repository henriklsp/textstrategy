// Natural-language quantity phrases for resources, used by the
// <resource amount> text substitution tag: "no food", "one basket of food",
// "2 stacks of wood", "one silver coin", "no weapons".
// The count is spelled out for one ("one") and given as digits for every
// other amount, per the authoring guide's wishes.
export class AmountPhrases {
    // For each resource: [phrase for "not any", phrase for exactly one,
    // phrase for larger amounts; %n is replaced with the number]
    private static readonly PHRASES: Record<string, [string, string, string]> = {
        food:       ['no food',         'one basket of food',     '%n baskets of food'],
        wood:       ['no wood',          'one stack of wood',      '%n stacks of wood'],
        silver:     ['no silver',       'one silver coin',        '%n silver coins'],
        gold:       ['no gold',         'one golden trinket',     '%n golden trinkets'],
        copper:     ['no copper',       'one copper bar',         '%n copper bars'],
        iron:       ['no iron',         'one iron bar',           '%n iron bars'],
        weapons:    ['no weapons',      'one weapon',             '%n weapons'],
        population: ['no people',      'one person',             '%n people'],
    };

    // Whether <name amount> is supported for this variable name
    public static supports(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(AmountPhrases.PHRASES, name);
    }

    // The quantity phrase for a resource value; rounds to whole numbers
    public static phrase(name: string, value: number): string {
        const entry = AmountPhrases.PHRASES[name];
        if (!entry) {
            return '<ERROR: ' + name + ' amount not supported>';
        }
        const n = Math.round(value);
        if (n <= 0) return entry[0];
        if (n === 1) return entry[1];
        return entry[2].replace('%n', n.toString());
    }
}
