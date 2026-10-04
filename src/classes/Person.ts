// Represents a character with personality traits.
// Each Person has at least 3 traits: at least one positive, one negative, one tertiary.
export class Person {
    private name: string;
    private positiveTraits: Set<string>;
    private negativeTraits: Set<string>;
    private tertiaryTraits: Set<string>;
    
    // Constructor with just a name
    constructor(name: string);
    
    // Constructor with name and three traits (positive, negative, tertiary)
    constructor(name: string, positiveTrait: string, negativeTrait: string, tertiaryTrait: string);
    
    constructor(name: string, positiveTrait?: string, negativeTrait?: string, tertiaryTrait?: string) {
        this.name = name;
        this.positiveTraits = new Set<string>();
        this.negativeTraits = new Set<string>();
        this.tertiaryTraits = new Set<string>();
        
        if (positiveTrait !== undefined && negativeTrait !== undefined && tertiaryTrait !== undefined) {
            this.positiveTraits.add(positiveTrait);
            this.negativeTraits.add(negativeTrait);
            this.tertiaryTraits.add(tertiaryTrait);
        }
    }
    
    public getName(): string {
        return this.name;
    }

    // Add a positive trait to this person
    public addPositiveTrait(trait: string): void {
        this.positiveTraits.add(trait);
    }

    // Add a negative trait to this person
    public addNegativeTrait(trait: string): void {
        this.negativeTraits.add(trait);
    }

    // Add a tertiary trait to this person
    public addTertiaryTrait(trait: string): void {
        this.tertiaryTraits.add(trait);
    }

    // Get how this person has a specific trait
    // Returns: "positive", "negative", "tertiary", or null if not present
    public getTraitType(trait: string): "positive" | "negative" | "tertiary" | null {
        if (this.positiveTraits.has(trait)) {
            return "positive";
        }
        if (this.negativeTraits.has(trait)) {
            return "negative";
        }
        if (this.tertiaryTraits.has(trait)) {
            return "tertiary";
        }
        return null;
    }

    // Check if this person has a specific trait (any type)
    public hasTrait(trait: string): boolean {
        return this.positiveTraits.has(trait) || 
               this.negativeTraits.has(trait) || 
               this.tertiaryTraits.has(trait);
    }

    // Check if this person has positive version of a trait
    public hasPositiveTrait(trait: string): boolean {
        return this.positiveTraits.has(trait);
    }

    // Check if this person has negative version of a trait
    public hasNegativeTrait(trait: string): boolean {
        return this.negativeTraits.has(trait);
    }

    // Check if this person has tertiary version of a trait
    public hasTertiaryTrait(trait: string): boolean {
        return this.tertiaryTraits.has(trait);
    }

    // Get all traits this person has
    public getAllTraits(): { trait: string; type: "positive" | "negative" | "tertiary" }[] {
        const allTraits: { trait: string; type: "positive" | "negative" | "tertiary" }[] = [];
        for (const trait of this.positiveTraits) {
            allTraits.push({ trait, type: "positive" });
        }
        for (const trait of this.negativeTraits) {
            allTraits.push({ trait, type: "negative" });
        }
        for (const trait of this.tertiaryTraits) {
            allTraits.push({ trait, type: "tertiary" });
        }
        return allTraits;
    }
}
