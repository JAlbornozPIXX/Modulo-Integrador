import type { Session } from '../contracts/domain/auth';
import type User from '@/modules/user/models/User';
import JWTService from './JWTService';

export default class SessionService{
    #jwt = new JWTService();

    create(user: User): Session{
        return {
            token: this.#jwt.sign(user.id),
            user
        };
    }
}

