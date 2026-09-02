import { eventBus } from './EventBus';
import { getEventGroup, getEvents } from './EventGroup';
import { EventError } from '@/shared/errors/EventError';

type EventHandler = (payload: unknown) => unknown;

export const registerEventGroup = (GroupClass: new () => object) => {
    const group = getEventGroup(GroupClass);
    if(!group) throw EventError.UndefinedGroup();

    const instance = new GroupClass() as Record<string | symbol, EventHandler>;

    for(const { event, handlerName } of getEvents(GroupClass)){
        eventBus.subscribe(`${group}.${event}`, instance[handlerName].bind(instance));
    }
};
