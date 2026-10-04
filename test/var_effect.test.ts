import { VarEffect } from '../src/classes/VarEffect';
import { DataModel, RESOURCES } from '../src/classes/DataModel';

describe('VarEffect', () => {
    let dataModel: DataModel;

    beforeEach(() => {
        dataModel = new DataModel();
    });

    test('adjusts variable by the specified amount', () => {
        const effect = new VarEffect('silver', 1);
        effect.takeEffect(dataModel);
        expect(dataModel.get('silver')).toBe(1);
    });

    test('handles negative adjustments', () => {
        dataModel.adjust('gold', 10);
        const effect = new VarEffect('gold', -3);
        effect.takeEffect(dataModel);
        expect(dataModel.get('gold')).toBe(7);
    });

    test('multiple effects on same variable accumulate', () => {
        const effect1 = new VarEffect('population', 10);
        const effect2 = new VarEffect('population', 5);

        effect1.takeEffect(dataModel);
        effect2.takeEffect(dataModel);

        expect(dataModel.get('population')).toBe(15);
    });

    test.each(RESOURCES)('works with resource %s', (resource) => {
        const effect = new VarEffect(resource, 42);
        effect.takeEffect(dataModel);
        expect(dataModel.get(resource)).toBe(42);
    });
});
