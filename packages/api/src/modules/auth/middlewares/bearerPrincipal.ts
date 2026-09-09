import type { FastifyRequest } from 'fastify';
import { AuthError } from '../contracts/domain/errors';
import JWTService from '../services/JWTService';
import type { Principal } from '../contracts/domain/auth';

const SCHEME = 'Bearer ';

export const bearerPrincipal = (req: FastifyRequest): Principal | null => {
    const header = req.headers.authorization;
    if(!header?.startsWith(SCHEME)) return null;

    try{
        const { sub } = new JWTService().verify(header.slice(SCHEME.length).trim());
        return { userId: sub };
    }catch{
        throw AuthError.InvalidToken();
    }
};
