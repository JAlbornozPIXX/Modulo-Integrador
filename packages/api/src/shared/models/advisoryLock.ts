import type { EntityManager } from 'typeorm';

export const advisoryLock = async (manager: EntityManager, namespace: number, key: string) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, $2))', [key, namespace]);
};
