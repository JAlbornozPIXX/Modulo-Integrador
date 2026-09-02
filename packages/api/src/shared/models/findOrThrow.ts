import { BaseEntity } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import type RuntimeError from '@app/core/RuntimeError';

export const findOrThrow = async <T extends BaseEntity>(
    model: { new (): T } & typeof BaseEntity,
    where: FindOptionsWhere<T>,
    missing: () => RuntimeError
): Promise<T> => {
    const found = await model.getRepository<T>().findOneBy(where);
    if(!found) throw missing();

    return found;
};
