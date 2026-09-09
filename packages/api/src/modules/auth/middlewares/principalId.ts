import type { FastifyRequest } from 'fastify';
import { AuthError } from '../contracts/domain/errors';

export const principalId = (req: FastifyRequest): string => {
    if(!req.principal) throw AuthError.Unauthorized();
    return req.principal.userId;
};
