import { describe, expect, it } from 'vitest';
import SecretCipher from '../src/SecretCipher';

describe('SecretCipher', () => {
    const cipher = new SecretCipher('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');

    it('round-trips a secret', () => {
        const payload = cipher.encrypt('sk-super-secret');

        expect(payload).not.toContain('sk-super-secret');
        expect(cipher.decrypt(payload)).toBe('sk-super-secret');
    });

    it('produces a different ciphertext per call', () => {
        expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
    });

    it('rejects an empty plaintext', () => {
        expect(() => cipher.encrypt('')).toThrowError('Crypto::EncryptFailed');
    });

    it('rejects a tampered payload', () => {
        const payload = cipher.encrypt('secret');
        const [iv, tag, data] = payload.split(':');
        const flipped = data.startsWith('0') ? `1${data.slice(1)}` : `0${data.slice(1)}`;

        expect(() => cipher.decrypt(`${iv}:${tag}:${flipped}`)).toThrowError('Crypto::DecryptFailed');
    });

    it('rejects a malformed payload', () => {
        expect(() => cipher.decrypt('not-a-payload')).toThrowError('Crypto::DecryptFailed');
    });

    it('rejects a key of the wrong length', () => {
        expect(() => new SecretCipher('too-short')).toThrowError('Config::InvalidEncryptionKey');
    });

    it('does not decrypt with a different key', () => {
        const other = new SecretCipher('fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210');

        expect(() => other.decrypt(cipher.encrypt('secret'))).toThrowError('Crypto::DecryptFailed');
    });
});
