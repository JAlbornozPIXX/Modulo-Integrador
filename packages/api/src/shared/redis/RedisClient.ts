import { Redis } from 'ioredis';
import { config } from '@/shared/config';

export const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true
});
