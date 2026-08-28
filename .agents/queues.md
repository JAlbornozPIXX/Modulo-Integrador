# Queues

Durable background work on **BullMQ + Redis**. Use a queue when work is slow, calls something
external, or must retry on failure (email, webhooks, third-party APIs). A queue subclass in a
module's `queues/` folder is discovered at boot and its worker is started automatically.

## When to use a queue

- **Queue** — slow / external / must-not-be-lost / should-retry work. Survives a handler
  throwing (BullMQ retries), runs off the request path.
- **Event** (events.md) — "X happened" fan-out, in-process, best-effort, not durable.
- The idiomatic combo: an **event handler enqueues a job**. The event says "it happened"; the
  queue reliably does the slow part.

## BaseQueue

`src/shared/queues/BaseQueue.ts` wraps one named BullMQ queue — its producer half (`add`) and
consumer half (`startWorker` → `process`):

```ts
export default abstract class BaseQueue<T>{
    abstract readonly name: string;
    #queue?: Queue;
    #worker?: Worker;

    async add(data: T){
        this.#queue ??= new Queue(this.name, { connection });
        await this.#queue.add(this.name, data, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        });
    }

    abstract process(data: T): Promise<void>;   // the one place the annotation stays: a declaration has no body to infer from

    startWorker(): Worker{
        this.#worker ??= new Worker(this.name, (job) => this.process(job.data as T), { connection });
        return this.#worker;
    }

    async close(){ await this.#worker?.close(); await this.#queue?.close(); }
}
```

Facts to rely on:
- `add(data)` enqueues with **3 attempts** and **exponential backoff** starting at 1000ms.
- `process(data)` is what you implement — the work itself. It should delegate to a
  single-purpose service (rule 1), not contain the logic inline.
- `startWorker()` is called for you by the bootstrap for every discovered queue; `close()` is
  called on shutdown. You don't call these.
- The Redis connection comes from `config.redis` (`{ host, port }`). `T` is your job payload
  type; it crosses Redis as JSON, so the worker does the one `as T` cast at that boundary.

## Recipe: a queue subclass

Default-export a `BaseQueue<T>` in your module's `queues/` folder. This is the real SMTP one:

```ts
// src/modules/notifications/queues/SMTP.ts
import BaseQueue from '@/shared/queues/BaseQueue';
import MailService from '../services/MailService';
import type { SendEmailPayload } from '../contracts/domain/notification';

export default class SMTPQueue extends BaseQueue<SendEmailPayload>{
    readonly name = 'smtp';
    #mail = new MailService();

    async process(data: SendEmailPayload){
        await this.#mail.send(data);
    }
}
```

`MailService` is the single-purpose worker (nodemailer transport built from the
platform SMTP settings); `SMTPQueue.process` just calls it. Set a unique `name`
per queue. When SMTP is not configured, `NotificationEvents.send` does not
enqueue.

## Enqueuing

Hold an instance and call `add`. In this codebase the enqueue happens from an event handler,
keeping the emit path fire-and-forget while the queue provides durability/retry:

```ts
// src/modules/notifications/events/NotificationEvents.ts
@DefineEventGroup('notification')
export default class NotificationEvents{
    #queue = new SMTPQueue();

    @Event('send')
    async send(payload: SendEmailPayload){
        await this.#queue.add(payload);
    }
}
```

Flow end to end: `eventBus.emit('notification.send', payload)` → `NotificationEvents.send` →
`SMTPQueue.add` → BullMQ (Redis) → worker → `SMTPQueue.process` → `MailService.send`.

## Running locally

Queues need Redis. `docker compose up -d --wait` (in `packages/api/`) starts the whole stack the
api boots against:
- **Postgres** on `5432` — the dev/deploy database (user, password and db all `pollium`).
- **Redis** on `6379` — the BullMQ connection.
- **RustFS** on `9000` (console `9001`) — S3-compatible object storage.

There is no SMTP service in compose. Configure the sink from Admin → Settings →
Mail (host `localhost`, port `1025` for Mailhog/Mailpit). Without a configured
host and from address the worker is never asked to send; with one and no sink,
`SMTPQueue` jobs exhaust their 3 attempts and fail.

Config keys involved (all via `@/shared/config`, set in `.env` — see `.env.example`):
`DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`. Mail host, port, from and credentials
live in platform settings, not env.

Behavior when Redis is down: `emit` still returns and the request still succeeds; the enqueue
fails/buffers in the background. Queues are the durability boundary, not the emit.

## Checklist for a new queue

1. Job payload type in `contracts/domain/`.
2. A `BaseQueue<Payload>` subclass in `queues/` with a unique `name` and a `process` that calls a service.
3. Enqueue via `new YourQueue().add(payload)` — usually from an event handler.
4. Ensure any new `config` keys the worker needs are added to `config.ts` and `.env.example`.

## Anti-patterns

- **Don't put the actual work in `process`** — delegate to a single-purpose service.
- **Don't call `startWorker()` / `close()` yourself** — the bootstrap manages lifecycle.
- **Don't reuse a `name` across queues** — it's the Redis queue identity.
- **Don't use a queue for work the caller needs the result of** — that's a direct call.
