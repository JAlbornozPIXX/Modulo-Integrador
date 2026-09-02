import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CryptoError } from './errors/CryptoError';
import { ConfigError } from './errors/ConfigError';

export default class SecretCipher{
    static readonly #ALGORITHM = 'aes-256-gcm';
    static readonly #IV_BYTES = 12;
    static readonly #KEY_BYTES = 32;

    readonly #key: Buffer;

    constructor(encryptionKey: string){
        this.#key = SecretCipher.#decodeKey(encryptionKey);
    }

    static #decodeKey(raw: string): Buffer{
        const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
        if(key.length !== SecretCipher.#KEY_BYTES) throw ConfigError.InvalidEncryptionKey();
        return key;
    }

    encrypt(plaintext: string): string{
        if(typeof plaintext !== 'string' || plaintext === ''){
            throw CryptoError.EncryptFailed();
        }

        const iv = randomBytes(SecretCipher.#IV_BYTES);
        const cipher = createCipheriv(SecretCipher.#ALGORITHM, this.#key, iv);
        const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
    }

    decrypt(payload: string): string{
        const parts = payload.split(':');
        if(parts.length !== 3) throw CryptoError.DecryptFailed();

        try{
            const [ivHex, tagHex, dataHex] = parts;
            const decipher = createDecipheriv(SecretCipher.#ALGORITHM, this.#key, Buffer.from(ivHex, 'hex'));
            decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
            return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
        }catch{
            throw CryptoError.DecryptFailed();
        }
    }
}
