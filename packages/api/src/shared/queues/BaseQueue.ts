import {
    Queue,
    Worker,
    type ConnectionOptions,
    type Job,
    type JobsOptions,
    type RateLimiterOptions,
    type RepeatOptions
} from 'bullmq';
import { config } from '@/shared/config';
import { logger } from '@/shared/utils/Logger';

const connection: ConnectionOptions = {
    host: config.redis.host,
    port: config.redis.port
};

const WORKER_STAGES = ['active', 'completed', 'failed'] as const;

export default abstract class BaseQueue<T>{
    abstract readonly name: string;

    protected readonly concurrency: number = config.queue.concurrency;

    protected readonly limiter: RateLimiterOptions | undefined = undefined;

    protected readonly jobOptions: JobsOptions = {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
    };

    #queue?: Queue;
    #worker?: Worker;

    async add(data: T, options: JobsOptions = {}){
        const job = await this.#connect().add(this.name, data, { ...this.jobOptions, ...options });
        this.#trace('enqueue', job);
    }

    abstract process(data: T): Promise<void>;

    protected async schedule(repeat: Omit<RepeatOptions, 'key'>, data?: T){
        await this.#connect().upsertJobScheduler(this.name, repeat, { name: this.name, data });
        this.#trace('schedule');
    }

    startWorker(): Worker{
        this.#worker ??= this.#traced(new Worker(this.name, (job) => this.process(job.data as T), {
            connection,
            concurrency: this.concurrency,
            limiter: this.limiter
        }));

        return this.#worker;
    }

    async close(){
        await this.#worker?.close();
        await this.#queue?.close();
    }

    #connect(): Queue{
        this.#queue ??= new Queue(this.name, { connection });

        return this.#queue;
    }

    #traced(worker: Worker): Worker{
        for(const stage of WORKER_STAGES){
            worker.on(stage, (job?: Job) => this.#trace(stage, job));
        }

        return worker;
    }

    #trace(stage: string, job?: Job){
        logger.debug(this.name, {
            scope: `queue.${stage}`,
            jobId: job?.id,
            attempts: job?.attemptsMade
        });
    }
}
