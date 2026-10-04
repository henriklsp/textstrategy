import { DataModel, RESOURCES } from '../src/classes/DataModel';

describe('DataModel', () => {
    let dataModel: DataModel;

    beforeEach(() => {
        dataModel = new DataModel();
    });

    test.each(RESOURCES)('known variable %s defaults to 0', (resource) => {
        expect(dataModel.get(resource)).toBe(0);
    });

    test('adjust increments variable', () => {
        dataModel.adjust('food', 1);
        expect(dataModel.get('food')).toBe(1);
    });

    test('multiple adjustments accumulate', () => {
        dataModel.adjust('silver', 5);
        dataModel.adjust('silver', -2);
        expect(dataModel.get('silver')).toBe(3);
    });

    test('get() throws for undefined variable', () => {
        expect(() => dataModel.get('undefined_var_xyz')).toThrow();
    });
});
