import { defineErrors } from '../defineErrors';

export const ConfigError = defineErrors({
    domain: 'Config',
    causes: {
        MissingEnv: 500,
        InvalidEncryptionKey: 500
    }
});
