export type RateLimitWindow = `${number}${'s' | 'm' | 'h'}`;

export interface RateLimitOptions{
    max: number;
    window: RateLimitWindow;
    by?: 'ip' | 'ip+route';
}

export interface RateLimitHit{
    count: number;
    resetMs: number;
}

export interface RateLimitEntry{
    count: number;
    expiresAt: number;
}

export interface RateLimitStore{
    hit(key: string, windowMs: number): Promise<RateLimitHit>;
}
