import ClassMetadata from '@/shared/utils/ClassMetadata';
import { EventBinding } from '@/shared/contracts/events';

const groupByClass = new WeakMap<object, string>();
const eventsByClass = new ClassMetadata<EventBinding>();

export const DefineEventGroup = (group: string): ClassDecorator => {
    return (target) => {
        groupByClass.set(target, group);
    };
};

export const getEventGroup = (ctor: object): string | undefined => {
    return groupByClass.get(ctor);
};

export const Event = (event: string): MethodDecorator => {
    return (target, handlerName) => {
        eventsByClass.append(target.constructor, { event, handlerName });
    };
};

export const getEvents = (ctor: object): EventBinding[] => {
    return eventsByClass.get(ctor);
};
