import type { MiddlewareFn } from '@/shared/middlewares/Middleware';
import { AuthError } from '../contracts/domain/errors';
import { bearerPrincipal } from './bearerPrincipal';

export const AuthenticatedRoute: MiddlewareFn = (req) => {
    const principal = bearerPrincipal(req);
    if(principal === null) throw AuthError.Unauthorized();

    req.principal = principal;
};
