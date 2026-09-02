import { RequestError } from '@/shared/errors/RequestError';
import { Page, PaginationOptions } from '@/shared/contracts/params';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const parseValue = (raw: unknown, defaultValue: number, minimum: number): number => {
    if(raw === undefined) return defaultValue;

    const value = Number(raw);
    if(!Number.isSafeInteger(value) || value < minimum){
        throw RequestError.InvalidPagination();
    }
    return value;
};

export const parsePagination = (query: unknown, options?: PaginationOptions): Page => {
    const raw = (query ?? {}) as Record<string, unknown>;

    const limit = Math.min(
        parseValue(raw.limit, options?.defaultLimit ?? DEFAULT_LIMIT, 1),
        options?.maxLimit ?? MAX_LIMIT
    );
    const offset = parseValue(raw.offset, 0, 0);

    return { limit, offset };
};
