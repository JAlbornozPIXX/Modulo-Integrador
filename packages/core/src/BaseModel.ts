import { BaseEntity, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { getHiddenFields } from './Hidden';
import { uuidv7 } from './uuidv7';

export default abstract class BaseModel extends BaseEntity{
    @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
    id: string = uuidv7();

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    toJSON(): Record<string, unknown>{
        const hidden = getHiddenFields(this.constructor);
        const output: Record<string, unknown> = {};
        for(const [key, value] of Object.entries(this)){
            if(!hidden.has(key)){
                output[key] = value;
            }
        }
        return output;
    }
}
