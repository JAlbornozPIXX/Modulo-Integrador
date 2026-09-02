import { describe, expect, it } from 'vitest';
import { parsePagination } from '@/shared/controllers/parsePagination';
import RuntimeError from '@app/core/RuntimeError';

describe('parsePagination', () => {
    it('defaults to limit 50 and offset 0', () => {
        expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
        expect(parsePagination(undefined)).toEqual({ limit: 50, offset: 0 });
    });

    it('parses explicit values', () => {
        expect(parsePagination({ limit: '10', offset: '20' })).toEqual({ limit: 10, offset: 20 });
    });

    it('clamps limit to the maximum', () => {
        expect(parsePagination({ limit: '500' })).toEqual({ limit: 100, offset: 0 });
    });

    it('honors per-route options', () => {
        expect(parsePagination({}, { defaultLimit: 5 })).toEqual({ limit: 5, offset: 0 });
        expect(parsePagination({ limit: '500' }, { maxLimit: 200 })).toEqual({ limit: 200, offset: 0 });
    });

    it.each([{ limit: '0' }, { limit: 'abc' }, { offset: '-1' }, { offset: '1.5' }])('rejects %o', (query) => {
        try{
            parsePagination(query);
            expect.unreachable('parsePagination should have thrown');
        }catch(error){
            expect(error).toBeInstanceOf(RuntimeError);
            expect((error as RuntimeError).message).toBe('Request::InvalidPagination');
            expect((error as RuntimeError).statusCode).toBe(400);
        }
    });
});
