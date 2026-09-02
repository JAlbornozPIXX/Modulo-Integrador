import { FastifyRequest } from 'fastify';
import { Middleware, MiddlewareFn } from '@/shared/middlewares/Middleware';
import { RateLimitOptions, RateLimitStore, RateLimitWindow } from '@/shared/contracts/rateLimit';
import MemoryRateLimitStore from '@/shared/services/MemoryRateLimitStore';
import { RateLimitError } from '@/shared/errors/RateLimitError';

const parseWindow = (window: RateLimitWindow): number => {
    const match = /^(\d+)([smh])$/.exec(window);
    if(!match) throw RateLimitError.InvalidWindow(window);

    const value = Number(match[1]);
    switch(match[2]){
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        default: return value * 60 * 60 * 1000;
    }
};

const clientKey = (req: FastifyRequest, by: RateLimitOptions['by']): string => {
    return by === 'ip' ? req.ip : `${req.routeOptions.url ?? req.url}:${req.ip}`;
};

export const rateLimitStore: RateLimitStore = new MemoryRateLimitStore();

export const RateLimit = (options: RateLimitOptions): MethodDecorator => {
    const windowMs = parseWindow(options.window);
    const by = options.by ?? 'ip+route';

    const guard: MiddlewareFn = async (req, reply) => {
        const hit = await rateLimitStore.hit(clientKey(req, by), windowMs);

        reply.header('X-RateLimit-Limit', options.max);
        reply.header('X-RateLimit-Remaining', Math.max(0, options.max - hit.count));

        if(hit.count > options.max){
            reply.header('Retry-After', Math.ceil(hit.resetMs / 1000));
            throw RateLimitError.TooManyRequests();
        }
    };

    return Middleware(guard) as MethodDecorator;
};
