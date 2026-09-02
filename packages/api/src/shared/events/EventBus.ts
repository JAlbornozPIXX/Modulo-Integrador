import { EventEmitter } from 'node:events';
import { logger } from '@/shared/utils/Logger';

type Handler = (payload: unknown) => unknown;

class EventBus{
    #emitter = new EventEmitter();
    #inFlight = new Set<Promise<unknown>>();

    subscribe(event: string, handler: Handler){
        this.#emitter.on(event, (payload) => {
            logger.debug(event, { scope: 'event.handle' });
            const work = Promise.resolve()
                .then(() => handler(payload))
                .catch((error) => logger.error(`EventBus::HandlerFailed:${event}`, error));

            this.#inFlight.add(work);
            work.finally(() => this.#inFlight.delete(work));
        });
    }

    emit<K extends keyof EventMap>(event: K, payload: EventMap[K]){
        logger.debug(event as string, { scope: 'event.emit' });
        this.#emitter.emit(event as string, payload);
    }

    async settled(){
        while(this.#inFlight.size > 0){
            await Promise.all(this.#inFlight);
        }
    }
}

export const eventBus = new EventBus();
