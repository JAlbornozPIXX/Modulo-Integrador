import { SchemaError } from '@app/core/errors/SchemaError';
import { config } from '@/shared/config';
import type { DataSource } from 'typeorm';

export const assertSchemaCurrent = async (dataSource: DataSource) => {
    if(config.databaseSynchronize) return;
    if(await dataSource.showMigrations()) throw SchemaError.PendingMigrations();
};
