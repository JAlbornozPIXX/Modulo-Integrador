import { FastifyReply, FastifyRequest } from 'fastify';
import type { IValidation } from 'typia';

export type ParamResolver = (req: FastifyRequest, reply?: FastifyReply) => unknown;

export type BodyValidator<T> = (input: unknown) => IValidation<T>;

export interface ParamBinding{
    handlerName: string | symbol;
    index: number;
    resolve: ParamResolver;
}

export interface PaginationOptions{
    defaultLimit?: number;
    maxLimit?: number;
}

export interface Page{
    limit: number;
    offset: number;
}
