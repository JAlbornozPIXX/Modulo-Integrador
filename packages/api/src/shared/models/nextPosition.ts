import { BaseEntity } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

type Positioned = BaseEntity & { position: number };

export const nextPosition = async <T extends Positioned>(
    model: { new (): T } & typeof BaseEntity,
    scope: FindOptionsWhere<T>
): Promise<number> => {
    const last = await model.getRepository<T>()
        .createQueryBuilder('entity')
        .where(scope)
        .orderBy('entity.position', 'DESC')
        .limit(1)
        .getOne();

    return last ? last.position + 1 : 0;
};
