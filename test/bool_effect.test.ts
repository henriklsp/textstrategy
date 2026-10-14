import { BoolEffect } from '../src/classes/BoolEffect';
import { DataModel } from '../src/classes/DataModel';
import { RESOURCES } from '../src/classes/DataModel';

describe('BoolEffect', () => {
    let dataModel: DataModel;

    beforeEach(() => {
        dataModel = new DataModel();
    });

    test('can set and unset boolean flags', () => {
        const effect = new BoolEffect('hasMetKing', true);
        effect.takeEffect(dataModel);
        expect(dataModel.isSet('hasMetKing')).toBe(true);

        const effectFalse = new BoolEffect('hasMetKing', false);
        effectFalse.takeEffect(dataModel);
        expect(dataModel.isSet('hasMetKing')).toBe(false);
    });

    test('unset boolean variable returns false', () => {
        expect(dataModel.isSet('hasMetKing')).toBe(false);
    });

    test.each(RESOURCES)('cannot set resource %s to boolean', (resource) => {
        const effect = new BoolEffect(resource, true);
        expect(() => effect.takeEffect(dataModel)).toThrow(/Cannot set integer variable/);
    });

    test('can set multiple different boolean variables', () => {
        const effect1 = new BoolEffect('hasMetKing', true);
        const effect2 = new BoolEffect('hasMetQueen', false);
        const effect3 = new BoolEffect('visitedCastle', true);

        effect1.takeEffect(dataModel);
        effect2.takeEffect(dataModel);
        effect3.takeEffect(dataModel);

        expect(dataModel.isSet('hasMetKing')).toBe(true);
        expect(dataModel.isSet('hasMetQueen')).toBe(false);
        expect(dataModel.isSet('visitedCastle')).toBe(true);
    });
});
