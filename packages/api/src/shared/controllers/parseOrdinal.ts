import { RequestError } from '@/shared/errors/RequestError';

export const parseOrdinal = (raw: unknown): number => {
    const value = Number(raw);
    if(!Number.isInteger(value) || value <= 0){
        throw RequestError.InvalidId();
    }
    return value;
};
