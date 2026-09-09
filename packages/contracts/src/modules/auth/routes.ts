import { get, post } from '../../shared/routing';
import type { SignInInput, SignUpInput } from './http';
import type { AuthSession } from './domain';
import type { UserProfile } from '../user/domain';
import type { BaseEntity } from '../../shared/base';

export const authRoutes = {
    signUp: post<SignUpInput, AuthSession>('/auth/sign-up'),
    signIn: post<SignInInput, AuthSession>('/auth/sign-in'),
    me: get<UserProfile & BaseEntity>('/auth/me')
};
