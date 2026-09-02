import { DataSource } from 'typeorm';
import { config } from '@/shared/config';
import { migrations } from './migrations';

export const createDataSource = (entities: Function[], overrides?: { synchronize?: boolean }): DataSource => {
    return new DataSource({
        type: 'postgres',
        url: config.databaseUrl,
        schema: config.databaseSchema,
        synchronize: overrides?.synchronize ?? config.databaseSynchronize,
        migrationsTableName: 'migrations',
        migrationsTransactionMode: 'all',
        entities,
        migrations
    });
};
