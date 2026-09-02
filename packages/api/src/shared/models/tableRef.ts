import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

export interface TableRef{
    table: string;
    primaryKey: string;
    column(property: string): string;
}

export const tableRef = (manager: EntityManager, target: EntityTarget<ObjectLiteral>): TableRef => {
    const metadata = manager.connection.getMetadata(target);

    return {
        table: metadata.tablePath.split('.').map((part) => `"${part}"`).join('.'),
        primaryKey: metadata.primaryColumns[0]!.databaseName,
        column: (property) => metadata.findColumnWithPropertyPathStrict(property)!.databaseName
    };
};
