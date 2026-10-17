import { DataModel } from '../src/classes/DataModel';
import { PrerequisiteParser } from '../src/classes/PrerequisiteParser';
import { PrerequisiteContext } from '../src/classes/Prerequisite';
import { EventParser } from '../src/classes/EventParser';
import * as fs from 'fs';
import * as path from 'path';

// Tests for BuildingStatePrerequisite ("built x", "constructing") and for
// choices with multiple (cond?) prerequisite groups.
describe('Building state prerequisites', () => {
    const makeContext = (dataModel: DataModel): PrerequisiteContext => ({
        dataModel,
        getPersonForRole: () => undefined
    });

    test('"built shelter" is met once the shelter is completed', () => {
        const dm = new DataModel();
        const prereq = PrerequisiteParser.parseCondition('built shelter');
        expect(prereq).not.toBeNull();
        expect(prereq!.isMet(makeContext(dm))).toBe(false);
        dm.completeBuilding('shelter');
        expect(prereq!.isMet(makeContext(dm))).toBe(true);
    });

    test('"built" is case-insensitive for the building name', () => {
        const dm = new DataModel();
        dm.completeBuilding('shelter');
        const prereq = PrerequisiteParser.parseCondition('built Shelter');
        expect(prereq).not.toBeNull();
        expect(prereq!.isMet(makeContext(dm))).toBe(true);
    });

    test('"built castle" is not a recognized condition', () => {
        expect(PrerequisiteParser.parseCondition('built castle')).toBeNull();
    });

    test('"constructing" is met while any building is under construction', () => {
        const dm = new DataModel();
        const prereq = PrerequisiteParser.parseCondition('constructing');
        expect(prereq).not.toBeNull();
        expect(prereq!.isMet(makeContext(dm))).toBe(false);
        dm.set('wood', 20);
        expect(dm.startBuildingConstruction('mine')).toBe(true);
        expect(prereq!.isMet(makeContext(dm))).toBe(true);
    });

    test('"constructing mine" targets a specific building', () => {
        const dm = new DataModel();
        dm.set('wood', 20);
        dm.startBuildingConstruction('mine');
        const mine = PrerequisiteParser.parseCondition('constructing mine');
        const dock = PrerequisiteParser.parseCondition('constructing dock');
        expect(mine!.isMet(makeContext(dm))).toBe(true);
        expect(dock!.isMet(makeContext(dm))).toBe(false);
    });

    test('"not built shelter" negates the built condition', () => {
        const dm = new DataModel();
        const prereq = PrerequisiteParser.parseCondition('not built shelter');
        expect(prereq!.isMet(makeContext(dm))).toBe(true);
        dm.completeBuilding('shelter');
        expect(prereq!.isMet(makeContext(dm))).toBe(false);
    });
});

describe('Choices with multiple conditions', () => {
    const parse = (text: string) => new EventParser().parseText(text);

    test('a choice can have several (cond?) groups, all must be met', () => {
        const parser = new EventParser();
        const event = parser.parseText(
            '§1\nBuild what?\n#2 (wood 1?)(not built shelter) Shelter\n'
        );
        expect(parser.getIssues().map(i => i.message)).toEqual([]);

        const choice = event.getSections()[0].getChoices()[0];
        expect(choice.getText()).toBe('Shelter');
        expect(choice.getPrerequisites().length).toBe(2);

        const dm = new DataModel();
        dm.set('wood', 1);
        expect(choice.arePrerequisitesMet({ dataModel: dm, getPersonForRole: () => undefined })).toBe(true);

        dm.completeBuilding('shelter');
        expect(choice.arePrerequisitesMet({ dataModel: dm, getPersonForRole: () => undefined })).toBe(false);

        const dm2 = new DataModel();
        dm2.set('wood', 0);
        expect(choice.arePrerequisitesMet({ dataModel: dm2, getPersonForRole: () => undefined })).toBe(false);
    });

    test('a single condition group still works as before', () => {
        const parser = new EventParser();
        const event = parser.parseText('§1\n#2 (wood 5?) Farm\n');
        const choice = event.getSections()[0].getChoices()[0];
        expect(choice.getText()).toBe('Farm');
        expect(choice.getPrerequisites().length).toBe(1);
    });

    test('invalid conditions are reported and stay visible in the choice text', () => {
        const parser = new EventParser();
        parser.parseText('§1\n#2 (built castle?) Castle\n');
        expect(parser.getIssues().some(i => i.message.includes('Invalid choice condition'))).toBe(true);
    });
});

describe('canbuild condition', () => {
    const makeContext = (dataModel: DataModel): PrerequisiteContext => ({
        dataModel,
        getPersonForRole: () => undefined
    });

    test('canbuild is met when everything lines up', () => {
        const dm = new DataModel();
        dm.set('wood', 5);
        const prereq = PrerequisiteParser.parseCondition('canbuild farm');
        expect(prereq).not.toBeNull();
        expect(prereq!.isMet(makeContext(dm))).toBe(true);
    });

    test('canbuild requires the resources', () => {
        const dm = new DataModel();
        dm.set('wood', 4); // farm costs 5
        const prereq = PrerequisiteParser.parseCondition('canbuild farm');
        expect(prereq!.isMet(makeContext(dm))).toBe(false);
    });

    test('canbuild is case-insensitive', () => {
        const dm = new DataModel();
        dm.set('wood', 5);
        expect(PrerequisiteParser.parseCondition('canBuild Farm')!.isMet(makeContext(dm))).toBe(true);
    });

    test('canbuild fails for unknown buildings', () => {
        expect(PrerequisiteParser.parseCondition('canbuild castle')).toBeNull();
    });

    test('canbuild is not met when the building is already built or under construction', () => {
        const dm = new DataModel();
        dm.set('wood', 20);
        dm.completeBuilding('shelter');
        expect(PrerequisiteParser.parseCondition('canbuild shelter')!.isMet(makeContext(dm))).toBe(false);

        const dm2 = new DataModel();
        dm2.set('wood', 20);
        dm2.startBuildingConstruction('mine');
        expect(PrerequisiteParser.parseCondition('canbuild mine')!.isMet(makeContext(dm2))).toBe(false);
    });

    test('canbuild is not met while something else is under construction', () => {
        const dm = new DataModel();
        dm.set('wood', 20);
        dm.startBuildingConstruction('shelter');
        const prereq = PrerequisiteParser.parseCondition('canbuild hall');
        expect(prereq!.isMet(makeContext(dm))).toBe(false);
    });

    test('canbuild mirrors the engine: canStartConstruction and startBuildingConstruction agree', () => {
        const dm = new DataModel();
        dm.set('wood', 20);
        const prereq = PrerequisiteParser.parseCondition('canbuild shelter')!;
        expect(prereq.isMet(makeContext(dm))).toBe(dm.canStartConstruction('shelter'));
        expect(dm.startBuildingConstruction('shelter')).toBe(true);
        expect(prereq.isMet(makeContext(dm))).toBe(dm.canStartConstruction('shelter'));

        // After construction, starting again fails just like the condition
        dm.completeBuilding('shelter');
        expect(dm.startBuildingConstruction('shelter')).toBe(false);
        expect(prereq.isMet(makeContext(dm))).toBe(false);
    });

    test('the engine allows only one construction site at a time', () => {
        const dm = new DataModel();
        dm.set('wood', 20);
        expect(dm.startBuildingConstruction('shelter')).toBe(true);
        expect(dm.startBuildingConstruction('hall')).toBe(false);
        expect(dm.getBuildingsUnderConstruction()).toHaveLength(1);
    });
});

describe('Council cannot order already-built buildings', () => {
    test('council.txt parses clean with the gated construction choices', () => {
        const parser = new EventParser();
        const councilPath = path.join(__dirname, '..', 'text', 'workinprogress', 'council.txt');
        const event = parser.parseText(fs.readFileSync(councilPath, 'utf-8'));
        expect(parser.getIssues()).toEqual([]);

        const section8 = event.getSections().find(s => s.getSectionNumber() === 8);
        expect(section8).toBeDefined();

        // Every building choice is gated by a single (canbuild x?) condition
        const buildingChoices = section8!.getChoices().filter(c =>
            ['Shelter', 'Hall', 'Workshop', 'Farm', 'Storage', 'Mine', 'Dock'].includes(c.getText())
        );
        expect(buildingChoices.length).toBe(7);
        for (const choice of buildingChoices) {
            expect(choice.getPrerequisites().length).toBeGreaterThanOrEqual(1);
        }

        // Once the shelter is built, the Shelter choice is no longer offered
        const dm = new DataModel();
        const context = { dataModel: dm, getPersonForRole: () => undefined };
        dm.set('wood', 20);
        const shelter = buildingChoices.find(c => c.getText() === 'Shelter')!;
        expect(shelter.arePrerequisitesMet(context)).toBe(true);
        dm.completeBuilding('shelter');
        expect(shelter.arePrerequisitesMet(context)).toBe(false);

        // The construction-order agenda item disappears while something is being built
        const section1 = event.getSections().find(s => s.getSectionNumber() === 1);
        const orderChoice = section1!.getChoices().find(c =>
            c.getText().includes('Order construction')
        );
        expect(orderChoice).toBeDefined();
        expect(orderChoice!.arePrerequisitesMet(context)).toBe(true);
        dm.startBuildingConstruction('hall');
        expect(orderChoice!.arePrerequisitesMet(context)).toBe(false);
    });
});
