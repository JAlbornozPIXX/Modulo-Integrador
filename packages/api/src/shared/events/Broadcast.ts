import { Redis } from 'ioredis';
import { config } from '@/shared/config';
import { logger } from '@/shared/utils/Logger';

type BroadcastHandler = (payload: unknown) => void;

class Broadcast{
    #publisher?: Redis;
    #subscriber?: Redis;
    #handlers = new Map<string, BroadcastHandler[]>();

    async publish(channel: string, payload: unknown){
        this.#publisher ??= this.#connect();
        await this.#publisher.publish(channel, JSON.stringify(payload));
    }

    subscribe(channel: string, handler: BroadcastHandler){
        const handlers = this.#handlers.get(channel) ?? [];
        handlers.push(handler);
        this.#handlers.set(channel, handlers);

        this.#subscriber ??= this.#listen();
        void this.#subscriber.subscribe(channel);
    }

    async close(){
        await this.#publisher?.quit();
        await this.#subscriber?.quit();
        this.#publisher = undefined;
        this.#subscriber = undefined;
        this.#handlers.clear();
    }

    #connect(): Redis{
        return new Redis({ host: config.redis.host, port: config.redis.port });
    }

    #listen(): Redis{
        const subscriber = this.#connect();

        subscriber.on('message', (channel: string, message: string) => {
            for(const handler of this.#handlers.get(channel) ?? []){
                try{
                    handler(JSON.parse(message));
                }catch(error){
                    logger.error(`Broadcast::HandlerFailed:${channel}`, error);
                }
            }
        });

        return subscriber;
    }
}

export const broadcast = new Broadcast();
