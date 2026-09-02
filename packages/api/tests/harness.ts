import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DataSource } from 'typeorm';
import Application from '@/core/Application';
import BaseQueue from '@/shared/queues/BaseQueue';
import { objectStorage } from '@/shared/storage/ObjectStorage';
import { config } from '@/shared/config';
import { ConfigError } from '@app/core/errors/ConfigError';
import { eventBus } from '@/shared/events/EventBus';

export interface TestApp{
    app: FastifyInstance;
    dataSource: DataSource;
    resetDb: () => Promise<void>;
    close: () => Promise<void>;
}

interface TableRow{
    tablename: string;
}

const testSchema = (): string => {
    const schema = config.databaseSchema;
    if(!schema || schema === 'public') throw ConfigError.MissingEnv('DATABASE_SCHEMA');
    return schema;
};

const truncateAll = async (dataSource: DataSource) => {
    const schema = testSchema();
    const rows: TableRow[] = await dataSource.query('SELECT tablename FROM pg_tables WHERE schemaname = $1', [schema]);
    if(rows.length === 0) return;

    const tables = rows.map((row) => `"${schema}"."${row.tablename}"`).join(', ');
    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
};

export const createTestApp = async (): Promise<TestApp> => {
    const application = new Application();
    const app = await application.build({ queues: false });
    const dataSource = application.dataSource!;

    return {
        app,
        dataSource,
        resetDb: () => truncateAll(dataSource),
        close: () => application.stop()
    };
};

export const useApp = (): TestApp => {
    const ctx = {} as TestApp;

    beforeAll(async () => {
        Object.assign(ctx, await createTestApp());
    });
    afterAll(() => ctx.close());
    beforeEach(async () => {
        // Re-stubbed per test, because a suite that restores its own mocks also restores these.
        vi.spyOn(BaseQueue.prototype, 'add').mockResolvedValue();
        vi.spyOn(objectStorage, 'put').mockResolvedValue();
        vi.spyOn(objectStorage, 'putImmutable').mockResolvedValue();
        vi.spyOn(objectStorage, 'delete').mockResolvedValue();
        vi.spyOn(objectStorage, 'get').mockResolvedValue(Buffer.from(''));
        vi.spyOn(objectStorage, 'exists').mockResolvedValue(false);
        await ctx.resetDb();
    });
    afterEach(() => eventBus.settled());

    return ctx;
};

export const flushEvents = () => eventBus.settled();
