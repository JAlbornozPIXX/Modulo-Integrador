import { describe, expect, it } from 'vitest';
import { parseId } from '@/shared/controllers/parseId';
import RuntimeError from '@app/core/RuntimeError';

const UUID = '019ca945-0a00-7000-8000-010000000000';

describe('parseId', () => {
    it('parses a uuid', () => {
        expect(parseId(UUID)).toBe(UUID);
    });

    it('lowercases so a link pasted in caps still resolves', () => {
        expect(parseId(UUID.toUpperCase())).toBe(UUID);
    });

    it.each([
        '42',
        '0',
        UUID.slice(0, -1),
        `${UUID}0`,
        UUID.replace('-', ''),
        'gggggggg-0a00-7000-8000-010000000000',
        'abc',
        '',
        undefined,
        null
    ])('rejects %o', (raw) => {
        try{
            parseId(raw);
            expect.unreachable('parseId should have thrown');
        }catch(error){
            expect(error).toBeInstanceOf(RuntimeError);
            expect((error as RuntimeError).message).toBe('Request::InvalidId');
            expect((error as RuntimeError).statusCode).toBe(400);
        }
    });
});
