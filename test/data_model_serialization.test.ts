import { DataModel } from '../src/classes/DataModel';
import { Person } from '../src/classes/Person';

describe('DataModel serialization', () => {
    test('round trip preserves numeric and boolean variables', () => {
        const model = new DataModel();
        model.set('food', 12);
        model.adjust('silver', 7);
        model.setCurrentDay(4);
        model.set('metKing', true);

        const restored = DataModel.fromJSON(model.toJSON());
        expect(restored.get('food')).toBe(12);
        expect(restored.get('silver')).toBe(7);
        expect(restored.getCurrentDay()).toBe(4);
        expect(restored.isSet('metKing')).toBe(true);
        expect(restored.isSet('unsetFlag')).toBe(false);
    });

    test('round trip preserves bounty', () => {
        const model = new DataModel();
        model.setBounty(3.5);
        const restored = DataModel.fromJSON(model.toJSON());
        expect(restored.getBounty()).toBe(3.5);
    });

    test('round trip preserves cast of characters with traits', () => {
        const model = new DataModel();
        model.addPerson(new Person('Astrid', 'brave', 'stubborn', 'curious'));
        const restored = DataModel.fromJSON(model.toJSON());
        const cast = restored.getCast();
        expect(cast.length).toBe(1);
        expect(cast[0].getName()).toBe('Astrid');
        expect(cast[0].hasPositiveTrait('brave')).toBe(true);
        expect(cast[0].hasNegativeTrait('stubborn')).toBe(true);
        expect(cast[0].hasTertiaryTrait('curious')).toBe(true);
        expect(cast[0].hasTrait('missing')).toBe(false);
    });

    test('round trip preserves task assignments', () => {
        const model = new DataModel();
        model.addPerson(new Person('Astrid', 'brave', 'stubborn', 'curious'));
        model.addPerson(new Person('Bjorn', 'strong', 'dull', 'loyal'));
        model.assignPersonToTask('Astrid', 'hunting');
        model.assignPersonToTask('Bjorn', 'build');

        const restored = DataModel.fromJSON(model.toJSON());
        expect(restored.getTaskForPerson('Astrid')).toBe('hunting');
        expect(restored.getTaskForPerson('Bjorn')).toBe('build');
        expect(restored.getPersonsForTask('build')).toEqual(['Bjorn']);
    });

    test('round trip preserves buildings under construction and completed buildings', () => {
        const model = new DataModel();
        model.set('wood', 50);
        model.set('copper', 20);
        model.set('iron', 20);
        model.setCurrentDay(2);
        expect(model.startBuildingConstruction('farm')).toBe(true);
        model.completeBuilding('storage');

        const restored = DataModel.fromJSON(model.toJSON());
        expect(restored.isBuildingUnderConstruction('farm')).toBe(true);
        const under = restored.getBuildingsUnderConstruction();
        expect(under.length).toBe(1);
        expect(under[0].buildingType).toBe('farm');
        expect(under[0].startDay).toBe(2);
        expect(under[0].daysToBuild).toBe(model.getBuildingsUnderConstruction()[0].daysToBuild);
        expect(restored.isBuildingCompleted('storage')).toBe(true);
        expect(restored.getCompletedBuildings()).toEqual(['storage']);
    });

    test('serialization is plain JSON (localStorage-compatible)', () => {
        const model = new DataModel();
        model.set('food', 10);
        model.set('flag', true);
        const json = JSON.parse(JSON.stringify(model.toJSON()));
        const restored = DataModel.fromJSON(json);
        expect(restored.get('food')).toBe(10);
        expect(restored.isSet('flag')).toBe(true);
    });

    test('restored model accepts further updates independently of the original', () => {
        const model = new DataModel();
        model.set('food', 10);
        const restored = DataModel.fromJSON(model.toJSON());
        restored.adjust('food', 5);
        model.adjust('food', -3);
        expect(restored.get('food')).toBe(15);
        expect(model.get('food')).toBe(7);
    });
});
