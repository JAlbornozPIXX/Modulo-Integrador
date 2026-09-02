export interface RetrySpacing{
    floorMs: number;
    ceilingMs: number;
}

export const retryDelayMs = (attempt: number, { floorMs, ceilingMs }: RetrySpacing): number => {
    const spaced = Math.min(ceilingMs, floorMs * 2 ** Math.max(0, attempt - 1));

    return Math.round(spaced * (0.75 + Math.random() * 0.5));
};
