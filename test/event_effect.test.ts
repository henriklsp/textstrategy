import { EventEffect } from '../src/classes/EventEffect';
import { DataModel } from '../src/classes/DataModel';
import { EventParser } from '../src/classes/EventParser';
import { EffectContext } from '../src/classes/Effect';

describe('EventEffect', () => {
    let dataModel: DataModel;
    let mockScheduler: jest.Mock<void>;
    let context: EffectContext;

    beforeEach(() => {
        dataModel = new DataModel();
        mockScheduler = jest.fn();
        context = {
            getPersonForRole: () => undefined,
            scheduleEvent: mockScheduler,
            setPendingChoiceCapture: jest.fn(),
            getChoiceVariable: () => undefined
        };
    });

    test('schedules event with context', () => {
        const effect = new EventEffect('tempEvent', 1);
        effect.takeEffect(dataModel, context);
        expect(mockScheduler).toHaveBeenCalledWith('tempEvent', 1);
    });

    test('uses default delay of 0 when not specified', () => {
        const effect = new EventEffect('myEvent');
        effect.takeEffect(dataModel, context);
        expect(mockScheduler).toHaveBeenCalledWith('myEvent', 0);
    });

    test('does not throw when no context is provided', () => {
        const effect = new EventEffect('tempEvent', 1);
        expect(() => effect.takeEffect(dataModel)).not.toThrow();
    });

    test('EventParser should parse [event tempevent 1] to EventEffect with eventName "tempevent" and delay 1', () => {
        const parser = new EventParser();
        const text = '§1\n[event tempevent 1]\nText here';
        const event = parser.parseText(text);
        
        const sections = event.getSections();
        expect(sections.length).toBeGreaterThan(0);
        
        const section1 = sections[0];
        const effects = section1.getEffects();
        
        expect(effects.length).toBe(1);
        expect(effects[0]).toBeInstanceOf(EventEffect);
        
        const eventEffect = effects[0] as EventEffect;
        expect(eventEffect.getEventName()).toBe('tempevent');
        expect(eventEffect.getDelay()).toBe(1);
    });

    test('EventParser should parse [event myEvent 5] to EventEffect with eventName "myEvent" and delay 5', () => {
        const parser = new EventParser();
        const text = '§1\n[event myEvent 5]\nText here';
        const event = parser.parseText(text);
        
        const sections = event.getSections();
        const section1 = sections[0];
        const effects = section1.getEffects();
        
        const eventEffect = effects[0] as EventEffect;
        expect(eventEffect.getEventName()).toBe('myEvent');
        expect(eventEffect.getDelay()).toBe(5);
    });

    test('EventEffect should not have eventNumber property', () => {
        const effect = new EventEffect('tempEvent', 1);
        expect((effect as any).eventNumber).toBeUndefined();
    });
});
