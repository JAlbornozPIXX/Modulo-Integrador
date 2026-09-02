import { optionalEnv, requiredEnv } from '@app/core/env';

const corsOrigins = (optionalEnv('CORS_ORIGIN') ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
const port = Number(requiredEnv('PORT'));
const apiUrl = optionalEnv('API_URL') ?? `http://localhost:${port}`;

export const config = {
    port,
    apiUrl,
    databaseUrl: requiredEnv('DATABASE_URL'),
    databaseSchema: optionalEnv('DATABASE_SCHEMA'),
    databaseSynchronize: optionalEnv('DATABASE_SYNCHRONIZE') !== 'false',
    corsOrigins,
    webUrl: optionalEnv('WEB_URL') ?? corsOrigins[0] ?? 'http://localhost:5173',

    log: {
        level: optionalEnv('LOG_LEVEL') ?? 'info',
        pretty: optionalEnv('LOG_PRETTY') === 'true'
    },

    storage: {
        endpoint: requiredEnv('STORAGE_ENDPOINT'),
        region: optionalEnv('STORAGE_REGION') ?? 'us-east-1',
        accessKey: requiredEnv('STORAGE_ACCESS_KEY'),
        secretKey: requiredEnv('STORAGE_SECRET_KEY'),
        bucket: requiredEnv('STORAGE_BUCKET'),
        publicUrl: requiredEnv('STORAGE_PUBLIC_URL'),
        maxUploadBytes: Number(optionalEnv('STORAGE_MAX_UPLOAD_BYTES') ?? 26_214_400)
    }
} as const;
