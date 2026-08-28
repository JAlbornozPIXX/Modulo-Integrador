# Pollium API — agent guide

You are working in the Pollium API (`packages/api`): **Fastify + TypeORM**, ESM, run with
`tsx` (no build step). There is no external framework — the scaffolding (routing, middleware,
serialization, events, queues) is custom: small decorators record metadata that base classes
read at startup. Modules are **auto-discovered** from the filesystem by folder convention.

This file is the **api** entry point — [AGENTS.md](../AGENTS.md) at the repo root routes here
for backend work and to [client-architecture.md](client-architecture.md) for the web app instead.
Read the spoke that matches your task before writing code — each is short and has copyable
examples plus explicit "do NOT" rules.

| If you are going to… | Read |
|---|---|
| Work in the web app instead | [client-architecture.md](client-architecture.md) |
| Understand how the app boots and a request flows | [architecture.md](architecture.md) |
| Add or change a module (controller, model, service) | [adding-a-module.md](adding-a-module.md) |
| Emit or handle a domain event | [events.md](events.md) |
| Do background work / send email / anything async | [queues.md](queues.md) |
| Give the AI tutor a tool it can call | [adding-a-module.md](adding-a-module.md) |
| Write or run tests | [testing.md](testing.md) |
| Know the coding rules (errors, responses, style) | [conventions.md](conventions.md) |
| Know the quality bar — what not to write | [anti-slop.md](anti-slop.md) |

## The 10-second model

```
src/core/       # bootstrap: Application, ModuleDiscovery, data-source — you rarely touch this
src/shared/     # cross-cutting primitives (base classes, decorators, config). NEVER imports modules/
src/modules/    # one folder per feature; the folder IS the registration
```

A module folder is scanned for four **category folders**, each optional:

```
src/modules/<name>/
    controllers/   # default-exported classes extending BaseController → mounted at /<name>
    models/        # default-exported TypeORM entities extending BaseModel → registered on the DataSource
    events/        # default-exported @DefineEventGroup classes → subscribed to the event bus
    queues/        # default-exported BaseQueue subclasses → workers started at boot
    tools/         # default-exported @DefineToolGroup classes → AI tools the tutor may call
    services/      # business logic (not auto-discovered; imported by the above)
    middlewares/   # module-owned guards (not auto-discovered; referenced via @Middleware)
    contracts/     # types: domain/ (internal), http/ (request DTOs), types/ (.d.ts augmentations)
```

**Adding a module = creating its folder.** There is no registry file, no `index.ts` per
module, no central array to edit. Put a default-exported class in the right category folder
and it wires itself.

## Non-negotiable rules (full list in conventions.md)

1. **One responsibility per class** — split when a class starts doing two things.
2. **Controllers only translate HTTP ↔ domain** — logic lives in services.
3. **Types live in `contracts/`** — never declared loose in the file that uses them.
4. **Errors are `throw DomainError.Cause()`** — factories from `defineErrors` (`@/shared/errors/defineErrors`) that bind each `Domain::Cause` to its status; never `throw new Error`, never a raw string.
5. **`shared/` never imports from `modules/`** — cross-module type sharing happens via global declaration merging (see events.md), not imports.
6. **Every entity extends `BaseModel`** — it provides `id`/`createdAt`/`updatedAt` and `@Hidden`-aware `toJSON`.
7. **Env is read only through `config`** (`@/shared/config`) — it fails loud on missing vars.
8. **No comments** — names, types and structure carry the meaning; the only exception is a typia tag on a `@pollium/contracts` DTO field.
9. **English everywhere** — identifiers, files, error messages, commits.

## Verify your work

- `pnpm typecheck`, `pnpm lint` and `pnpm test` must pass. Tests are Vitest through the vite pipeline and run
  against the **compose Postgres** (one schema per pool slot), so start it first with
  `docker compose up -d --wait`; Redis and S3 stay mocked. See [testing.md](testing.md).
- **CI enforces the rule above** — it is no longer only a convention. `.github/workflows/ci.yml`
  runs, on every pull request and every push to `main`: `pnpm install --frozen-lockfile`, then the
  api typecheck, lint and tests, then the web lint, build and tests. Node is pinned by the root
  `.nvmrc`. CI supplies Postgres as a service container and leaves Redis and S3 mocked, exactly as
  they are locally — so a suite that needs a real queue or bucket does not belong in `pnpm test`.
  `--frozen-lockfile` is the one check that has no local equivalent: it fails when a `package.json`
  was edited without regenerating `pnpm-lock.yaml`, which is invisible on the author's machine.
  Two details in that workflow are load-bearing: `pnpm/action-setup` must pin `version: 10`
  explicitly, because it otherwise reads `packageManager` from a root `package.json` that this
  workspace deliberately does not have; and `packages/contracts` gets no step of its own because
  the `tsc -b` half of the web build already compiles it through a project reference.
- Dependencies are managed with **pnpm** via the root `pnpm-workspace.yaml` (there is no
  root `package.json` on purpose). Install with `pnpm install` from anywhere in the repo.
- To exercise HTTP/events/queues end-to-end you need the compose stack: `docker compose up -d --wait`
  in `packages/api/` starts **Postgres** on `5432` (the dev/deploy database), **Redis** on `6379`
  (queues) and **RustFS** on `9000` (object storage). The api will not boot without them.
- Copy `.env.example` → `.env` before running.
