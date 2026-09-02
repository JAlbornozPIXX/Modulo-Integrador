import ModuleDiscovery from '@/core/modules/discovery';
import { createDataSource } from '@/core/models/data-source';

const { entities } = await new ModuleDiscovery().discover();
const dataSource = createDataSource(entities, { synchronize: false });

await dataSource.initialize();
try{
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    console.log(JSON.stringify(upQueries.map((query) => query.query), null, 4));
}finally{
    await dataSource.destroy();
}
