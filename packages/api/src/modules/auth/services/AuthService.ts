import type { SignInInput, SignUpInput } from '@app/contracts/modules/auth/http';
import type { Session } from '../contracts/domain/auth';
import { AuthError } from '../contracts/domain/errors';
import { eventBus } from '@/shared/events/EventBus';
import { isUniqueViolation } from '@/shared/models/isUniqueViolation';
import { findOrThrow } from '@/shared/models/findOrThrow';
import User from '@/modules/user/models/User';
import PasswordService from './PasswordService';
import SessionService from './SessionService';
import { assertPasswordPolicy } from './PasswordPolicy';

export default class AuthService{
    #password = new PasswordService();
    #session = new SessionService();

    async signUp(input: SignUpInput): Promise<Session>{
        assertPasswordPolicy(input.password);

        const passwordHash = await this.#password.hash(input.password);
        const user = await this.#insert(input.email, passwordHash);

        eventBus.emit('user.created', { userId: user.id, email: user.email });

        return this.#session.create(user);
    }

    async signIn(input: SignInInput): Promise<Session>{
        const user = await User.findOneBy({ email: input.email });

        if(!user
            || user.passwordHash === null
            || !(await this.#password.verify(input.password, user.passwordHash))){
            throw AuthError.InvalidCredentials();
        }

        return this.#session.create(user);
    }

    currentUser(userId: string): Promise<User>{
        return findOrThrow(User, { id: userId }, AuthError.Unauthorized);
    }

    async #insert(email: string, passwordHash: string): Promise<User>{
        try{
            return await User.create({ email, passwordHash }).save();
        }catch(error){
            if(isUniqueViolation(error)) throw AuthError.EmailAlreadyRegistered();
            throw error;
        }
    }
}
