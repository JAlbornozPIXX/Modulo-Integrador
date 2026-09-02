import { RequestError } from '@/shared/errors/RequestError';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const parseId = (raw: unknown): string => {
    if(typeof raw !== 'string') throw RequestError.InvalidId();

    const value = raw.toLowerCase();
    if(!UUID.test(value)) throw RequestError.InvalidId();
    return value;
};
