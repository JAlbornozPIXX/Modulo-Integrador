import ModuleDiscovery from '@/core/modules/discovery';
import { createDataSource } from '@/core/models/data-source';
import { logger } from '@/shared/utils/Logger';

const { entities } = await new ModuleDiscovery().discover();
const dataSource = createDataSource(entities, { synchronize: false });

await dataSource.initialize();
try{
    const applied = await dataSource.runMigrations();
    logger.info(`applied ${applied.length} migration(s)`, { scope: 'schema' });
}finally{
    await dataSource.destroy();
}
