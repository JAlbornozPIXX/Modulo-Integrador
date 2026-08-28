# Architecture

How the app boots, how a request flows, and the one pattern the whole framework is built on.

## The core pattern: decorator → metadata → base class

Nothing self-mounts. A decorator only **records metadata** keyed by the class constructor; a
base class or the bootstrap **reads** that metadata at startup and does the wiring. Every
decorator in the codebase (`@Route`, `@Middleware`, `@DefineEventGroup`, `@Event`, `@Status`,
`@Hidden`, and the WebSocket set `@Channel`/`@OnMessage`/`@OnConnect`/`@OnDisconnect`) follows
this shape, and they all store through one helper:

`src/shared/utils/ClassMetadata.ts` — an append-only multimap keyed by constructor (it lives in
`shared/` because every decorator stores through it, and `shared/` may not import `core/`):

```ts
export default class ClassMetadata<T>{
    #store = new WeakMap<object, T[]>();
    append(ctor: object, item: T){ /* lazily create array, push */ }
    get(ctor: object): T[] { return this.#store.get(ctor) ?? []; }
}
```

So `@Route` does `routesByController.append(target.constructor, {...})`, and
`BaseController.register` later calls `getRoutes(this.constructor)`. If you add a new
decorator, copy this pattern — a module-level `ClassMetadata` (or `WeakMap` for single
values like `@Status`/`@DefineEventGroup`), a factory that `append`s/`set`s, and a `getX`
accessor.

## Boot sequence

`src/server.ts` is tiny: import `reflect-metadata` and `dotenv/config`, construct
`Application`, call `start()`, and wire `SIGTERM`/`SIGINT` → `stop()`.

`src/core/Application.ts#build()` runs, in order:

1. `new ModuleDiscovery().discover()` — scan `src/modules/` and collect controllers, entities, event groups, queues, gateways.
2. `createDataSource(entities)` + `initialize()` — the DataSource is built **from the discovered entities**, not a hardcoded list.
3. Register the global error handler (maps `RuntimeError` → its status; everything else → 500; body is `{ error }`).
4. Mount each controller: `new Controller().register(app, prefix)`, then each gateway: `new Gateway().register(app)`.
5. `events.forEach(registerEventGroup)` — instantiate each group and subscribe its handlers.
6. `tools.forEach((ToolGroup) => toolRegistry.register(ToolGroup))` — instantiate each tool group and
   index its tools by `<group>.<method>`. Unlike the other categories, tools are not bound at boot:
   the registry builds an SDK tool set **per completion**, closing over the caller's
   `{ userId, orgId, sessionId }`, so a tool can never read an identity out of model-authored arguments.
7. Start a worker per discovered queue (skipped with `build({ queues: false })` — the test
   harness uses this to avoid Redis).

`start()` is `build()` + `app.listen({ port: config.port, host: '0.0.0.0' })`. The test
harness (see testing.md) calls `build()` directly and drives the app with `app.inject()`.

`@fastify/websocket` is registered up front (with `@fastify/multipart`) so gateway routes can declare `{ websocket: true }`.

`stop()` closes Fastify, closes every queue (`worker` then `queue`), and destroys the DataSource — clean shutdown for SIGTERM/SIGINT.

## Module discovery

`src/core/modules/discovery.ts` reads `src/modules/`, keeps directories, sorts them, and for
each module loads the **default export** of every file in six category folders:

| Folder | Becomes | Notes |
|---|---|---|
| `controllers/` | mounted routes | prefix = `/<moduleFolderName>` |
| `models/` | DataSource entities | |
| `events/` | subscribed event groups | |
| `queues/` | started workers | |
| `gateways/` | mounted WebSocket channels | path comes from `@Channel`, not the folder name |
| `tools/` | AI tools on the tool registry | name is `<group>_<method>`, composed by `@DefineToolGroup` + `@Tool` |

Rules baked into the loader:
- Only `.ts` files, excluding `.d.ts`. (Correct because `dev`/`start` both run under `tsx` with no build step. If a compile step is ever added, revisit this filter.)
- A missing category folder is fine — it yields nothing, no error.
- Only the **default export** is picked up. A file with no default export is silently ignored.
- The controller prefix comes from the **folder name**: `modules/auth/` → `/auth`. There is no `@Controller` decorator and no prefix argument to set by hand.

**Anti-pattern:** do not create a per-module `index.ts`, a `ModuleDefinition`, or any central
registry array. That was removed on purpose — the folder structure is the contract.

## Request flow

```
Fastify → preHandler (middlewares, class-level first) → controller handler
        → service (business logic) → model (persistence)
        → BaseController wraps the return value → response
```

`src/shared/controllers/BaseController.ts#register` mounts each route inside a Fastify plugin
scope with the prefix, turning module metadata into `scope.route(...)`:

```ts
scope.route({
    method: route.method,
    url: route.path,
    preHandler: middlewares.map((mw) => async (req, reply) => { await mw(req, reply); }),
    handler
});
```

Two things to internalize here:

- **Middlewares are wrapped in async on purpose.** In Fastify 5 a `preHandler` with a
  sync `(req, reply)` signature is treated as callback-style and **hangs** waiting for a
  `done()` that never comes. Wrapping every middleware in `async (req, reply) => { await mw(...) }`
  makes it promise-based so both sync and async `MiddlewareFn`s work. Do not unwrap this.
- **The response envelope is automatic** (`#wrap`). A handler returns raw domain data; the
  base class wraps it. See conventions.md for the exact `{ data }` / 204 / `@Status` rules.

### Rate limiting

`@RateLimit({ max, window })` (`src/shared/middlewares/RateLimit.ts`) caps a single handler
per client per fixed window. It builds a `MiddlewareFn` and registers it through the same
`Middleware(...)` binding path as any other guard — no bespoke pipeline. The key is
`route:ip` by default (`by: 'ip'` switches to a per-client budget shared across routes), the
N+1th hit gets `429 RateLimit::TooManyRequests` with `Retry-After`, and every response
carries `X-RateLimit-Limit` / `X-RateLimit-Remaining`.

Counters live behind the `RateLimitStore` interface (`src/shared/contracts/rateLimit.ts`).
The default `MemoryRateLimitStore` is an in-process fixed-window counter: correct for a
single instance, but counts are **not shared across instances** — before scaling the api
horizontally, swap the store singleton in `RateLimit.ts` for a Redis-backed implementation
(`INCR` + `PEXPIRE`); the decorator does not change. Correct client IPs behind a proxy also
require Fastify's `trustProxy`, which is not configured yet.

## The layers, and the one hard boundary

```
core/     → may import shared/ and modules/ (it orchestrates them)
modules/  → may import shared/ and (sparingly) other modules/
shared/   → may import ONLY shared/. NEVER core/ or modules/.
```

The `shared/ → modules/` ban is the load-bearing rule. It is why the typed event bus uses a
**global `EventMap` interface** that modules augment (declaration merging) instead of `shared/`
importing module payload types — see events.md. When you need `shared/` to "know" about a
module type, augment a global interface; never add the import.
