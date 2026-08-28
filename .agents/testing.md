# Testing

How to write and run tests. The suite is **Vitest** running through the existing
`vite.config.ts` — same plugins, same transforms as production.

## Why Vitest is load-bearing, not a preference

`@Body()` validation does not exist in the source: the `autoValidateBody` plugin injects
`typia.misc.createValidatePrune<T>()` at build time and `@typia/unplugin` compiles it
(vite.config.ts). Vitest executes tests through that same pipeline, so a test exercises the
exact code production runs. **Do not introduce Jest, `node:test`, or a `tsx`-based runner** —
under any of them controllers run with `@Body()` unvalidated and the suite tests a different
app than the one deployed.

## Running

```
pnpm test          # single run
pnpm test:watch
```

The DB is the **compose Postgres** — the same engine dev and deploy run on, so there is no second
dialect to keep the schema valid on. Start it before the suite:

```
docker compose up -d --wait      # in packages/api/
```

Each Vitest pool slot gets its own Postgres **schema** (`test_1`, `test_2`, … from
`VITEST_POOL_ID`, created by `tests/setup.ts` and selected through `DATABASE_SCHEMA`), so files
run in parallel without seeing each other and **never touch the `public` schema your dev data
lives in**. `resetDb` truncates every table in that schema with `RESTART IDENTITY CASCADE`
instead of re-running `synchronize`, which is what keeps a 394-test suite at seconds rather than
minutes. The harness refuses to run if `DATABASE_SCHEMA` is missing or `public`.

Redis and S3 are still never touched — `tests/setup.ts` mocks `BaseQueue.prototype.add` and
`objectStorage.put`/`delete`, and the harness skips workers.

`vite.config.ts` raises Vitest's `hookTimeout` to 60s. `useApp()`'s `beforeAll` builds the whole
app — full module discovery, every controller through the typia transform, then `DataSource` init —
and on a **cold** typia cache that exceeds the 10s default and fails files with
`Hook timed out in 10000ms`. The cache lives in `node_modules/.cache/unplugin_typia`, so it is
cold on every CI run and after every reinstall. Don't lower it back: the symptom looks like a
hanging test but is just a one-time compile.

The `web` package runs the same command through its own `vite.config.ts` (`happy-dom`
environment, `src/**/tests/*.test.{ts,tsx}`). It covers the shared primitives that everything
else builds on — `useQuery`/`useMutation` in `src/shared/hooks/api/tests/` — mounted with the
`renderHook`/`deferred` helpers in `src/shared/tests/`. No component-testing stack: a probe
component rendering the hook is all these need. `src/shared/tests/setup.ts` installs an in-memory
`localStorage` because the global one in this environment is an empty object, so the
`pollium.*`-backed primitives (session token, theme, recents) are testable — a store that reads
storage in its initialiser is re-hydrated in a test with `vi.resetModules()` plus a dynamic
import.

## Layout

```
tests/                          # infrastructure, imported via the @tests alias
    setup.ts                    # env vars + per-slot Postgres schema + queue/storage mocks (runs before every file)
    harness.ts                  # useApp(), createTestApp(), authHeader(), flushEvents()
    request.ts                  # request() — typed Endpoint caller — route() and expectError()
    Seed.ts                     # the Seed base class (user/org/member/workspace/orgContext) + the `seed` singleton
src/modules/<name>/tests/       # the module's HTTP suite (*.test.ts) + its <Module>Seed class
src/shared/tests/               # unit tests for shared primitives
```

**Never put a `.test.ts` inside a category folder** (`controllers/`, `models/`, `events/`,
`queues/`, `gateways/`) — discovery loads every default export there and would mount the
test file as a controller. A module's `tests/` folder is not scanned, so it is safe.

## The main layer: HTTP integration through the full app

Controllers are declarative and services use Active Record, so the behaviour worth testing
lives in the composition: middleware → parameter decorators → service → envelope. Test it
end-to-end against the discovered app. A suite is: `useApp()` once, then per test
seed → `request()` → assert. `src/modules/notes/tests/NoteController.test.ts` is the full
template:

```ts
import { describe, expect, it } from 'vitest';
import { noteRoutes } from '@pollium/contracts/modules/note/routes';
import { useApp } from '@tests/harness';
import { request, expectError } from '@tests/request';
import { noteSeed } from './NoteSeed';

describe('NoteController', () => {
    const ctx = useApp();

    it('creates a note wrapped in the data envelope', async () => {
        const seed = await noteSeed.orgContext();

        const res = await request(ctx.app, noteRoutes.create, {
            as: seed.user.id,
            body: { workspaceId: seed.workspace.id, title: 'First note', content: 'Hello' }
        });

        expect(res.status).toBe(201);
        expect(res.data()).toMatchObject({ title: 'First note', userId: seed.user.id });
    });

    it('returns 404 for a missing note', async () => {
        const seed = await noteSeed.orgContext();

        expectError(await request(ctx.app, noteRoutes.get, { as: seed.user.id, params: { id: 999 } }),
            404, 'Note::NotFound');
    });
});
```

The helpers, and the rules they encode:

- **`useApp()`** — the whole lifecycle in one line: builds the app once per file
  (`Application#build({ queues: false })` — full discovery, DataSource on the slot's schema, no
  `listen()`, no workers), resets the DB before each test, closes on teardown. The returned
  context is populated in `beforeAll`, so never destructure it in the describe body — read
  `ctx.app` inside tests. Vitest isolates each file in its own process, so each file has its
  own app and DB.
- **`request(app, endpoint, { as, body, params, query })`** — the test twin of the web's
  `call()`: takes a contracts route-table row, interpolates `params` into `:name` segments,
  signs a real JWT for `as`, and returns `{ status, body, json(), data() }` with `data()`
  typed by the endpoint's phantom output. Never hand-build method + URL for a route that has
  a contracts row; routes still on the `@Route(path, method)` string form go through
  `request(app, route('GET', '/league/...'), ...)` — `route(method, path)` builds an ad-hoc
  `Endpoint` so string-form routes share the same caller. The one exception is multipart
  uploads (workspace files, user avatar): `request()` does not do multipart, so those tests
  hand-build `app.inject` calls.
- **`expectError(res, status, 'Domain::Cause')`** — the error assert. Validation tests add
  `expect(res.json()).toMatchObject({ errors: { field: message } })` on top.
- **A paginated handler is asserted on the envelope, not `data()`.** `res.data()` returns the
  envelope's `data` field, while a paginated route declares `PageOf<T>` as its output (that is
  the shape the *client* receives once the web interceptor folds `meta` in). So read the wire
  directly and assert both halves — including that `meta.total` is the unpaginated total, which
  means seeding more rows than the limit:

  ```ts
  const envelope = res.json<ApiResponse<ChatMessage[]>>();
  expect(envelope.data).toHaveLength(1);
  expect(envelope.meta).toEqual({ total: 2, limit: 1, offset: 0 });
  ```

  Every `@Pagination()` handler owes this assertion — it is what keeps a route's declared
  `PageOf<T>` honest, since nothing checks the two against each other at compile time.
- **`Seed` (`@tests/Seed`)** — the seed layer is class-based. The base class carries the
  spine almost every module hangs from: `seed.orgContext(role?)` builds user + org +
  membership + workspace, `seed.member(org, role?)` adds a second actor, and
  `seed.user()`/`seed.org(creator)`/`seed.workspace(org, creator)` are the pieces. Unique
  fields are sequence-generated off one static counter shared by every subclass — never
  hardcode an email twice. A module with its own entities subclasses it in its `tests/`
  folder (`class PracticeSeed extends Seed`, PascalCase file matching the class, exported as a
  singleton like `practiceSeed`) and adds entity methods (`practiceSeed.session(context, itemIds)`)
  and pure data builders (`practiceSeed.beats(objectives)`). Inside such a suite use only that
  module's singleton — including for spine methods (`practiceSeed.orgContext()`) — so each suite
  has a single seed import. Another module may import a seed sparingly, like modules import
  each other (the auth suite uses `userSeed.passwordUser()`). Where a method accepts
  overrides, apply them with `Object.assign(Entity.create({ ...defaults }), overrides).save()` —
  never spread the overrides object inside `Entity.create({...})`, which breaks TypeORM's
  return-type inference.
- **Auth is never mocked** — `as` signs a real token; middleware runs for real.

What belongs in this layer: status codes and envelopes (`{ data }`, `204`,
`{ error, errors }`), middleware gates (401/403, role gates), parameter-decorator rejections
(`Request::InvalidId`, `Request::ValidationFailed`), ownership rules (404 vs 403), and DB
effects (assert with the model, e.g. `Note.countBy(...)`).

## The other layers

- **Shared primitives** (`parseId`, `parsePagination`, `defineErrors`, `SecretCipher`,
  `toJSON`/`@Hidden`, `ClassMetadata`): plain unit tests in `src/shared/tests/`. Assert the
  thrown `RuntimeError`'s `message` (`Domain::Cause`) and `statusCode` — see
  `src/shared/tests/parseId.test.ts`.
- **Event groups**: `eventBus.emit('user.created', payload)`, then `await flushEvents()`
  (which awaits every in-flight handler through `eventBus.settled()`, including the ones a
  handler emits in turn), then assert the DB effect — never a throw.
- **Queues**: `BaseQueue.add` is already a spy — assert it was called to verify enqueueing.
  Test the job itself by calling `process(data)` directly; it delegates to a service, so
  there is no BullMQ to involve.

## Do NOT

- **No mocking of TypeORM models or repositories** — that fights the Active Record pattern;
  use the real in-memory DB.
- **No supertest / no `listen()`** — `app.inject()` (via `request()`) covers HTTP.
- **No Redis or S3 in tests** — enqueueing and storage are mocked at the seam
  (`tests/setup.ts`); if a test needs a real worker loop or bucket, it is an e2e concern
  behind `docker compose`, not part of `pnpm test`.
- **No second database engine** — the suite runs on the compose Postgres, the same engine as
  dev and deploy. Don't reintroduce SQLite (or any in-memory driver) to make `pnpm test`
  standalone; a suite that proves a dialect nothing ships on is worse than one that needs
  `docker compose up -d --wait`.
- **Never point `DATABASE_SCHEMA` at `public` in tests** — `resetDb` truncates every table in
  the configured schema, so that would wipe your dev database. The harness throws instead.
- **No test files in category folders** — discovery would mount them.
- **No per-test lifecycle boilerplate** — `useApp()` owns beforeAll/afterAll/beforeEach.
- **No hand-built envelopes or raw error strings in assertions** — assert the wire shapes
  (`{ data }`, `{ error: 'Domain::Cause' }`) exactly as contracts define them.
