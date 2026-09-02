import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { DataSource } from 'typeorm';
import { config } from '@/shared/config';
import { createDataSource } from '@/core/models/data-source';
import { assertSchemaCurrent } from '@/core/models/schema-guard';
import ModuleDiscovery, { type MountedController } from '@/core/modules/discovery';
import { logger } from '@/shared/utils/Logger';
import { broadcast } from '@/shared/events/Broadcast';
import type { LogLevel } from '@/shared/contracts/logging';
import { registerEventGroup } from '@/shared/events/registerEventGroup';
import RuntimeError from '@app/core/RuntimeError';
import ValidationError from '@/shared/errors/ValidationError';
import { ApiError } from '@app/contracts/shared/http';
import type { HttpMethod } from '@app/contracts/shared/routing';
import type BaseQueue from '@/shared/queues/BaseQueue';
import type BaseGateway from '@/shared/gateways/BaseGateway';

export interface BuildOptions{
    queues?: boolean;
}

const CORS_METHODS: HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default class Application{
    #app!: FastifyInstance;
    #dataSource?: DataSource;
    #queues: BaseQueue<unknown>[] = [];

    get dataSource(): DataSource | undefined{
        return this.#dataSource;
    }

    async build({ queues: startQueues = true }: BuildOptions = {}): Promise<FastifyInstance>{
        logger.configure({ level: config.log.level as LogLevel, pretty: config.log.pretty });
        this.#app = Fastify({
            loggerInstance: logger.raw as FastifyBaseLogger,
            logController: new LogController({ disableRequestLogging: true })
        });

        await this.#app.register(cors, {
            origin: config.corsOrigins,
            credentials: true,
            methods: CORS_METHODS
        });
        await this.#app.register(multipart, {
            limits: { fileSize: config.storage.maxUploadBytes }
        });
        await this.#app.register(websocket);

        const {
            controllers,
            entities,
            events,
            queues,
            gateways
        } = await new ModuleDiscovery().discover();

        this.#dataSource = createDataSource(entities);
        await this.#dataSource.initialize();
        await assertSchemaCurrent(this.#dataSource);

        this.#registerErrorHandler();
        this.#registerRequestLogging();
        await this.#mountControllers(controllers);
        this.#mountGateways(gateways);
        events.forEach(registerEventGroup);
        if(startQueues) this.#startQueues(queues);

        return this.#app;
    }

    async start(){
        await this.build();
        await this.#app.listen({ port: config.port, host: '0.0.0.0' });
    }

    async stop(){
        await this.#app.close();
        await Promise.all(this.#queues.map((queue) => queue.close()));
        await broadcast.close();
        await this.#dataSource?.destroy();
    }

    #registerErrorHandler(){
        this.#app.setErrorHandler((err, req, reply) => {
            const status = err instanceof RuntimeError ? err.statusCode : 500;
            const message = err instanceof Error ? err.message : 'Internal Server Error';

            if(status >= 500){
                logger.error(`${req.method} ${req.url}`, err, { scope: 'http', statusCode: status });
            }

            const payload: ApiError = { error: message };
            if(err instanceof ValidationError) payload.errors = err.errors;

            reply.status(status).send(payload);
        });
    }

    #registerRequestLogging(){
        this.#app.addHook('onResponse', (req, reply, done) => {
            logger.debug(`${req.method} ${req.url}`, {
                scope: 'http',
                statusCode: reply.statusCode,
                ms: Math.round(reply.elapsedTime)
            });
            done();
        });
    }

    async #mountControllers(controllers: MountedController[]){
        for(const { prefix, Controller } of controllers){
            await new Controller().register(this.#app, prefix);
        }
    }

    #mountGateways(gateways: Array<new () => BaseGateway>){
        for(const Gateway of gateways){
            new Gateway().register(this.#app);
        }
    }

    #startQueues(queues: Array<new () => BaseQueue<unknown>>){
        for(const Queue of queues){
            const queue = new Queue();
            queue.startWorker();
            this.#queues.push(queue);
        }
    }
}
