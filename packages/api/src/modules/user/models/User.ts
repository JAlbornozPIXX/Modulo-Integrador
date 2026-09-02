import { Entity, Column } from 'typeorm';
import BaseModel from '@app/core/BaseModel';
import { Hidden } from '@app/core/Hidden';

@Entity()
export default class User extends BaseModel{
    @Column({ type: 'varchar', unique: true })
    email!: string;

    @Column({ type: 'varchar', nullable: true })
    @Hidden()
    passwordHash!: string | null;
}
