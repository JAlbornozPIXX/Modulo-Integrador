import { ConfigError } from './errors/ConfigError';

export const requiredEnv = (key: string): string => {
    const value = process.env[key];
    if(value === undefined || value === '') throw ConfigError.MissingEnv(key);
    return value;
};

export const optionalEnv = (key: string): string | undefined => {
    const value = process.env[key];
    return value === undefined || value === '' ? undefined : value;
};
