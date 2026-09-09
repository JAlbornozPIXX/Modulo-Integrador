import jwt from 'jsonwebtoken';
import { config } from '@/shared/config';
import type { TokenPayload } from '../contracts/domain/auth';

const EXPIRES_IN = '7d';

export default class JWTService {
    sign(userId: string): string {
        return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: EXPIRES_IN });
    }

    verify(token: string): TokenPayload {
        return jwt.verify(token, config.jwtSecret) as TokenPayload;
    }
}