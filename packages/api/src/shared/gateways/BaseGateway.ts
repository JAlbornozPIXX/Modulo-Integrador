import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getChannel } from './Channel';
import { getGatewayHandlers } from './Gateway';
import { createContext } from './context';
import ConnectionRegistry from './ConnectionRegistry';
import { getParamResolvers } from '@/shared/controllers/params';
import { abortScope } from '@/shared/services/AbortScope';
import { getClassMiddleware } from '@/shared/middlewares/Middleware';
import RuntimeError from '@app/core/RuntimeError';
import { GatewayError } from '@/shared/errors/GatewayError';
import { ApiError } from '@app/contracts/shared/http';
import { GatewayErrorScope, GatewaySocket, InboundFrame, OutboundMessage } from '@/shared/contracts/gateway';
import { logger } from '@/shared/utils/Logger';

export default abstract class BaseGateway{
    protected readonly connections = new ConnectionRegistry();

    readonly #messageHandlers = new Map<string, string | symbol>();
    readonly #connectHandlers: Array<string | symbol> = [];
    readonly #disconnectHandlers: Array<string | symbol> = [];

    register(app: FastifyInstance){
        const path = getChannel(this.constructor);
        if(!path) throw GatewayError.MissingChannel();

        this.#indexHandlers();
        const guards = getClassMiddleware(this.constructor);

        app.get(path, {
            websocket: true,
            preValidation: guards.map((mw) => async (req: FastifyRequest, reply: FastifyReply) => { await mw(req, reply); })
        }, (socket, req) => this.#onConnection(socket, req));
    }

    #indexHandlers(){
        for(const handler of getGatewayHandlers(this.constructor)){
            if(handler.kind === 'message') this.#messageHandlers.set(handler.type, handler.handlerName);
            else if(handler.kind === 'connect') this.#connectHandlers.push(handler.handlerName);
            else this.#disconnectHandlers.push(handler.handlerName);
        }
    }

    #onConnection(socket: GatewaySocket, req: FastifyRequest){
        const disconnected = new AbortController();

        this.connections.add(socket);
        for(const handlerName of this.#connectHandlers) void this.#runLifecycle(handlerName, socket, req);

        socket.on('message', (raw: Buffer) => {
            void abortScope.run(disconnected.signal, () => this.#dispatch(socket, req, raw.toString()));
        });

        socket.on('close', () => {
            disconnected.abort();
            this.connections.remove(socket);
            for(const handlerName of this.#disconnectHandlers) void this.#runLifecycle(handlerName, socket, req);
        });
    }

    async #dispatch(socket: GatewaySocket, req: FastifyRequest, raw: string){
        const frame = this.#parseFrame(raw);
        if(!frame){
            this.#sendError(socket, GatewayError.MalformedFrame());
            return;
        }

        const handlerName = this.#messageHandlers.get(frame.type);
        if(handlerName === undefined){
            this.#sendError(socket, GatewayError.UnknownMessageType(), frame);
            return;
        }

        try{
            const result = await this.#invoke(handlerName, socket, req, frame);
            if(result !== undefined && result !== null){
                this.#send(socket, { type: frame.type, data: result });
            }
        }catch(error){
            if(abortScope.signal()?.aborted === true) return;
            this.#handleError(socket, error, frame);
        }
    }

    #parseFrame(raw: string): InboundFrame | undefined{
        try{
            const frame = JSON.parse(raw) as InboundFrame;
            return typeof frame?.type === 'string' ? frame : undefined;
        }catch{
            return undefined;
        }
    }

    async #runLifecycle(handlerName: string | symbol, socket: GatewaySocket, req: FastifyRequest){
        try{
            await this.#invoke(handlerName, socket, req, undefined);
        }catch(error){
            this.#handleError(socket, error);
        }
    }

    async #invoke(handlerName: string | symbol, socket: GatewaySocket, req: FastifyRequest, frame: InboundFrame | undefined): Promise<unknown>{
        const ctx = createContext(req, socket, frame);
        const resolvers = getParamResolvers(this.constructor, handlerName);
        const args = await Promise.all(resolvers.map((resolve) => resolve(ctx)));

        const method = Reflect.get(this, handlerName) as (...args: unknown[]) => unknown;
        return method.apply(this, args);
    }

    #handleError(socket: GatewaySocket, error: unknown, frame?: InboundFrame){
        if(error instanceof RuntimeError){
            this.#sendError(socket, error, frame);
            return;
        }

        logger.error('gateway handler failed', error, { scope: 'ws' });
        this.#sendError(socket, GatewayError.Internal(), frame);
    }

    #send(socket: GatewaySocket, message: OutboundMessage<unknown>){
        socket.send(JSON.stringify(message));
    }

    #sendError(socket: GatewaySocket, error: RuntimeError, frame?: InboundFrame){
        const sessionId = frame === undefined ? undefined : frame.sessionId;
        const scope = typeof sessionId === 'string' ? { sessionId } : {};

        socket.send(JSON.stringify({ error: error.message, ...scope } satisfies ApiError & GatewayErrorScope));
    }
}
