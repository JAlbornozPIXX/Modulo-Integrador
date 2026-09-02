import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '@/shared/config';
import ModuleDiscovery from '@/core/modules/discovery';
import { migrations } from '@/core/models/migrations';

const SCHEMA = `migration_check_${(process.env.VITEST_POOL_ID ?? '1').replace(/\W/g, '')}`;

const build = (entities: Function[]): DataSource => new DataSource({
    type: 'postgres',
    url: config.databaseUrl,
    schema: SCHEMA,
    synchronize: false,
    migrationsTableName: 'migrations',
    migrationsTransactionMode: 'all',
    entities,
    migrations
});

describe('SchemaMigrations', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        const { entities } = await new ModuleDiscovery().discover();
        const setup = new DataSource({ type: 'postgres', url: config.databaseUrl });

        await setup.initialize();
        await setup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await setup.query(`CREATE SCHEMA "${SCHEMA}"`);
        await setup.destroy();

        dataSource = build(entities);
        await dataSource.initialize();
        await dataSource.runMigrations();
    });

    afterAll(async () => {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await dataSource.destroy();
    });

    it('builds a schema the entities already agree with, so a missing migration cannot ship', async () => {
        const { upQueries } = await dataSource.driver.createSchemaBuilder().log();

        expect(upQueries.map((query) => query.query)).toEqual([]);
    });

    it('leaves nothing pending once the migrations have run', async () => {
        expect(await dataSource.showMigrations()).toBe(false);
    });
});
