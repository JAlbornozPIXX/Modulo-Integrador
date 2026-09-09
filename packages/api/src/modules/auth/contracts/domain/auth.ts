import type { PublicUser } from '@/modules/user/contracts/domain/user';

export interface Session{
    token: string;
    user: PublicUser;
}

export interface Principal{
    userId: string;
}

export interface TokenPayload{
    sub: string;
}