import { RateLimitEntry, RateLimitHit, RateLimitStore } from '@/shared/contracts/rateLimit';

const SWEEP_INTERVAL_MS = 60_000;

export default class MemoryRateLimitStore implements RateLimitStore{
    #entries = new Map<string, RateLimitEntry>();
    #nextSweepAt = 0;
    #now: () => number;

    constructor(now: () => number = Date.now){
        this.#now = now;
    }

    async hit(key: string, windowMs: number): Promise<RateLimitHit>{
        const now = this.#now();
        this.#sweep(now);

        const entry = this.#entries.get(key);
        if(!entry || entry.expiresAt <= now){
            this.#entries.set(key, { count: 1, expiresAt: now + windowMs });
            return { count: 1, resetMs: windowMs };
        }

        entry.count += 1;
        return { count: entry.count, resetMs: entry.expiresAt - now };
    }

    #sweep(now: number){
        if(now < this.#nextSweepAt) return;
        this.#nextSweepAt = now + SWEEP_INTERVAL_MS;

        for(const [key, entry] of this.#entries){
            if(entry.expiresAt <= now) this.#entries.delete(key);
        }
    }
}
