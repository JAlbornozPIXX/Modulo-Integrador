import { vi } from 'vitest';

const databaseUrl = 'postgres://app:app@localhost:5450/app';
const schema = `test_${(process.env.VITEST_POOL_ID ?? '1').replace(/\W/g, '')}`;

Object.assign(process.env, {
    PORT: '3010',
    DATABASE_URL: databaseUrl,
    DATABASE_SCHEMA: schema,
    CORS_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    LOG_PRETTY: 'false',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6389',
    STORAGE_ENDPOINT: 'http://localhost:9010',
    STORAGE_ACCESS_KEY: 'test',
    STORAGE_SECRET_KEY: 'test',
    STORAGE_BUCKET: 'test',
    STORAGE_PUBLIC_URL: 'http://localhost:9010'
});

const { Client } = await import('pg');
const client = new Client({ connectionString: databaseUrl });
await client.connect();
await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
await client.end();

const { default: BaseQueue } = await import('@/shared/queues/BaseQueue');
const { objectStorage } = await import('@/shared/storage/ObjectStorage');

vi.spyOn(BaseQueue.prototype, 'add').mockResolvedValue();
vi.spyOn(objectStorage, 'put').mockResolvedValue();
vi.spyOn(objectStorage, 'putImmutable').mockResolvedValue();
vi.spyOn(objectStorage, 'delete').mockResolvedValue();
vi.spyOn(objectStorage, 'get').mockResolvedValue(Buffer.from(''));
vi.spyOn(objectStorage, 'list').mockResolvedValue({ objects: [], folders: [], cursor: null });
vi.spyOn(objectStorage, 'stat').mockResolvedValue(null);
vi.spyOn(objectStorage, 'exists').mockResolvedValue(false);
