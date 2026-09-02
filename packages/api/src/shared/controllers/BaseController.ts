import { FastifyInstance, FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify';
import { getRoutes } from './Route';
import { getStatus } from './Status';
import { getParamResolvers } from './params';
import RawResponse from './RawResponse';
import RedirectResponse from './RedirectResponse';
import Paginated from './Paginated';
import { getMiddleware } from '@/shared/middlewares/Middleware';
import { RouteError } from '@/shared/errors/RouteError';

type Handler = (req: FastifyRequest<RouteGenericInterface>, reply: FastifyReply) => unknown;

const relativeTo = (path: string, prefix: string): string => {
    if(path !== prefix && !path.startsWith(`${prefix}/`)){
        throw RouteError.PrefixMismatch(path);
    }
    return path.slice(prefix.length) || '/';
};

export default abstract class BaseController{
    async register(app: FastifyInstance, prefix: string){
        await app.register(async (scope) => {
            for(const route of getRoutes(this.constructor)){
                const handler = this.#wrap(route.handlerName);
                const middlewares = getMiddleware(this.constructor, route.handlerName);
                scope.route({
                    method: route.method,
                    url: route.absolute ? relativeTo(route.path, prefix) : route.path,
                    preHandler: middlewares.map((mw) => async (req, reply) => { await mw(req, reply); }),
                    handler
                });
            }
        }, { prefix });
    }

    #wrap(handlerName: string | symbol): Handler{
        const method = (Reflect.get(this, handlerName) as (...args: unknown[]) => unknown).bind(this);
        const override = getStatus(this.constructor, handlerName);
        const resolvers = getParamResolvers(this.constructor, handlerName);

        return async (req, reply) => {
            const args = await Promise.all(resolvers.map(async (resolve) => resolve(req, reply)));
            const result = await method(...args);

            if(result instanceof RawResponse){
                reply.status(override ?? result.status).type(result.contentType).send(result.body);
                return reply;
            }

            if(result instanceof RedirectResponse){
                reply.redirect(result.url, result.status);
                return reply;
            }

            if(result instanceof Paginated){
                reply.status(override ?? 200).send({ data: result.items, meta: result.meta });
                return reply;
            }

            if(result === undefined || result === null){
                reply.status(override ?? 204).send();
                return reply;
            }

            reply.status(override ?? 200).send({ data: result });
            return reply;
        };
    }
}
