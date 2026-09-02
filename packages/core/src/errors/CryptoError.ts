import { defineErrors } from '../defineErrors';

export const CryptoError = defineErrors({
    domain: 'Crypto',
    causes: {
        EncryptFailed: 400,
        DecryptFailed: 500
    }
});
