# Pollium Gateway — agent guide

You are working in the Pollium gateway (`packages/gateway`): a **standalone Fastify + TypeORM
service** (ESM, run with `vite-node`, no build step) that fronts Pollium's AI provider accounts
behind **pools** and adds failover. It does not serve learners — it serves whoever holds one of the
API keys it issued. The api points its managed platform provider rows at the gateway, and the
gateway picks a healthy upstream provider per request.

Shared primitives live in **`packages/core`** (`SecretCipher`, `RuntimeError`, `defineErrors`,
`BaseModel`, `@Hidden`, `requiredEnv`/`optionalEnv`). Import them from `@pollium/core/...`; never
re-declare a second copy here.

## The 10-second model

```
src/core/       # Application (fastify + datasource + error handler + route wiring), config
src/shared/     # cross-cutting: PoolError table, authenticate*(), buffered-proxy handler factory
src/modules/
    providers/  # the pool: GatewayProvider/GatewayUsage models, ProviderRegistry, ProviderHealth,
                # ProviderPicker, ProxyClient, ProviderExecutor, UsageRecorder, InFlight
    keys/       # GatewayApiKey and the secret helpers that hash and preview it
    admin/      # /admin/* — what Tower reads and writes, behind GATEWAY_ADMIN_KEY
    chat/       # POST /v1/chat/completions — OpenAI-compatible, streaming
    voice/      # /v1/speak, /v1/listen, /v1/models — Deepgram-compatible
    search/     # GET /res/v1/llm/context — Brave-compatible
scripts/        # seed-providers.ts
```

There is **no auto-discovery** here — `Application.#registerRoutes` calls each module's
`register*Routes(app)` explicitly. A new kind is a new module plus one line there.

**There is no pool entity.** A pool is just "the active providers of a kind", read by
`ProviderRegistry.activeFor(kind)`. Nobody configures pools; staff configure providers.

## The admin surface Tower drives

`registerAdminRoutes` mounts, under `/admin` and behind `authenticateAdmin`, provider CRUD
(`/kinds/:kind/providers`, `/providers/:id`), API key CRUD (`/keys`, `/keys/:id`) and `/overview`
(the dashboard aggregates). The admin key is a **separate** `GATEWAY_ADMIN_KEY`, so a client key
that only proxies traffic cannot reconfigure anything. Provider keys are encrypted on the way in
and `@Hidden` keeps `encryptedApiKey` out of every response.

Nobody calls these routes from a browser. `packages/tower` calls the api's staff-only `tower`
module, which proxies here — the api holds the admin key and enforces `StaffRoute`.
`seed-providers.ts` remains the way to bulk-load a providers file.

## The proxy contract

Every inbound route speaks a **vendor protocol**, so the api needs no special client — it just
points a provider row's `baseUrl` at the gateway:

| Kind | Ingress path | Vendor shape | Client auth | Provider auth |
|---|---|---|---|---|
| chat | `POST /v1/chat/completions` | OpenAI | `Authorization: Bearer <apiKey>` | `Authorization: Bearer <providerKey>` |
| voice | `POST /v1/speak`, `POST /v1/listen`, `GET /v1/models` | Deepgram | `Authorization: Token <apiKey>` | `Authorization: Token <providerKey>` |
| search | `GET /res/v1/llm/context` | Brave | `X-Subscription-Token: <apiKey>` | `X-Subscription-Token: <providerKey>` |

`authenticateClient()` hashes whatever the caller presented and looks for a live `GatewayApiKey`
with that `keyHash` — there is no shared ingress secret, and a revoked or deactivated key answers
`Pool::Unauthorized` on the next request. The row it returns is what `UsageRecorder` attributes the
request to. `authenticateAdmin()` compares `GATEWAY_ADMIN_KEY` with `timingSafeEqual` instead.
Provider keys are decrypted just-in-time from `GatewayProvider.encryptedApiKey`.

Chat is streamed (`runStream` — SSE passes through byte-identical and the final `usage` chunk is
tapped for accounting, cached prompt tokens included). Voice and search are buffered (`runBuffered`
via `bufferedProxyHandler`).

## Accounting, which the dashboard is made of

`UsageRecorder` writes one `GatewayUsage` row per request: tokens (input, cached, output), latency,
status, the provider, the key — and `costUsd`, priced at write time from the provider's own
`models[]` through `costOfTokens` (shared with the api, in `@pollium/contracts/modules/ai/pricing`).
Voice and search carry no tokens, so they cost 0. `InFlight` counts what is open right now:
`trackInFlight(reply)` increments and the reply's `close` event decrements, which is why a stream
stays counted until its last byte.

## Failover, the load-bearing behaviour

`ProviderExecutor` picks with `ProviderPicker` (uniformly at random among the eligible), and
loops: a provider is skipped when excluded this request or cooling down. **Retryable** outcomes
advance to the next provider: network failure (`UpstreamUnreachable`), and statuses
`401 403 404 408 429 5xx`. Any other status is returned to the caller as-is. For buffered kinds a
body-read failure also fails over. `ProviderHealth` cools a provider after 3 consecutive failures
for 30s. Once no eligible provider remains, `Pool::NoHealthyProvider` (503); when a kind has none
active at all, `Pool::NoProvider` (503). Every skip is logged with the provider and the reason —
without it a misconfigured upstream reads as an outage, since the 503 the caller sees names nothing.

Chat routes filter providers to those whose `models` list contains the requested id first, and
rewrite the model through the provider's `modelMap` on the way out.

## Verify your work

- `pnpm typecheck`, `pnpm lint`, `pnpm test` must pass. Tests are Vitest through `vite.config.ts`
  against the **compose Postgres** — start it with `docker compose up -d --wait` in
  `packages/gateway` (its own cluster on port 5433, db `pollium_gateway`). Each pool slot gets its
  own `gateway_test_N` schema, so files run in parallel and never touch your dev schema.
- Upstreams are never real in tests. `tests/fake-upstream.ts` boots a local Fastify that scripts
  responses and records every call (url, headers, body) — point seeded providers' `baseUrl` at it.
- `useApp()` in `tests/harness.ts` owns the lifecycle and resets the DB, `providerHealth` **and**
  `inFlight` between tests. Don't add per-test boilerplate. Proxy tests need a `seedApiKey()` — a
  request with no live key never reaches a provider.
- CI runs gateway typecheck/lint/test alongside the api's (`.github/workflows/ci.yml`).

## Do NOT

- **Don't add a second `SecretCipher`, `BaseModel`, or error factory** — they live in
  `packages/core`.
- **Don't parse or reshape streamed chat bytes** — the SSE passthrough must stay byte-identical;
  only tap for `usage`.
- **Don't store provider keys in plaintext** — always `SecretCipher.encrypt` on write, decrypt at
  call time. Client API keys are the other way round: only their sha256 is stored, so the secret is
  shown exactly once, when Tower issues it.
- **Don't reintroduce a shared ingress secret.** Every client authenticates with a key row that
  staff can revoke.
