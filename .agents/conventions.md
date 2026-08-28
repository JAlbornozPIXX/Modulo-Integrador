# Conventions

The rules for writing code in this codebase. The first ten are long-standing; the rest
(errors, responses, config) reflect how the code actually works today. When in doubt, match
the surrounding code.

## Core rules

**1. One responsibility per class.**
`JWTService` signs/verifies; `PasswordService` hashes/compares — they are not merged. If a
class grows a second job, split it. A queue's `process` delegates to a service; it doesn't
hold the logic.

**2. Controllers only translate HTTP ↔ domain.**
Read the request, call a service, return the result. No business rules, no complex model
access in controllers. Handlers declare what they need through **parameter decorators**
(`@Owned`, `@CurrentUser`, `@Body`, `@NumericParam`, `@Param`, `@Query`) instead of touching
`req` — see the "Parameter decorators" section below.

```ts
@Route(authRoutes.signIn)
signIn(@Body() body: SignInInput){
    return this.#service.signIn(body);
}
```

**3. Types live in `contracts/`, split by altitude.**
- `@pollium/contracts` (`packages/contracts`) — cross-package **wire** contracts, the single
  source of truth for everything that crosses HTTP between `api` and `web`. Its layout mirrors
  the rest of the repo — `src/modules/<name>/` per module plus `src/shared/`, with the same
  split-by-altitude inside each module:
  - `modules/<name>/domain.ts` — the wire nouns: `<Name>Profile` subsets, serialized entities
    as the client sees them (`Roadmap` with `createdAt: string`), wire enums
    (`OrganizationRole`, `FriendshipStatus`, `Language`). When a module's domain outgrows one
    file, it becomes a `modules/<name>/domain/<concept>.ts` directory — one concept per file,
    no barrel; consumers import the concept file directly (see `question`: `content`,
    `answer`, `skill`, `response`).
  - `modules/<name>/http.ts` — request DTOs (`<Verb><Noun>Input`). Validation rules live on
    the fields as typia comment tags (`/** @format email */`, `/** @minLength 8 */`) — the
    type IS the schema. Consumers compile a validator from it with a literal typia call
    (`typia.misc.createValidatePrune<SignInInput>()` at the api edge,
    `typia.createValidate<T>()` in web forms), transformed at build time by `@typia/unplugin`;
    nothing is declared twice.
  - `modules/<name>/routes.ts` — the module's endpoint table: full wire path + method per
    route, with request/response types as phantom generics
    (`create: post<CreateRoadmapInput, Roadmap>('/roadmaps')`). The api mounts rows with
    `@Route(roadmapRoutes.create)` — registration asserts the path matches the module's
    discovery prefix, so a drifted table fails the boot — and the web calls them through
    `call(roadmapRoutes.create, { body })` (`@/shared/api/call`). Routes whose wire types are
    not in contracts yet (workspace files, roadmap completions, league, server-only
    modules) keep the `@Route(path, method)` string form.
  - `modules/<name>/gateway.ts` — the module's websocket frames, when it has a gateway. Both
    directions: the inbound frame union the client handles (`ChatStreamFrame`) and the outbound
    payloads it sends (`SessionJoinPayload`, `ToolDecisionPayload`). Frames are not domain nouns,
    so they get their own file rather than piling into `domain.ts`.

    **A frame carrying an entity is generic over it.** The two sides disagree about dates by
    design: `BaseEntity` is serialized (`createdAt: string`) and the api's `<Name>Fields &
    BaseFields` is not (`Date`). An HTTP route can ignore that, because a route's response type
    is only consumed by the client and nothing checks the controller's return against it. A
    frame union cannot: the api *produces* frames, so `ChatStreamService.respond` yields model
    instances into it. Hence `ChatStreamFrame<M = ChatMessage>` — the client uses the default
    and the api instantiates `ChatStreamFrame<PublicChatMessage>` behind a one-line local alias
    (`contracts/gateway/chat.ts`). One declaration, two instantiations, and the divergence is
    visible instead of papered over with a duplicate union.

    Derive the channel handler map from the union rather than restating it
    (`ChatStreamFrames = { [T in ChatStreamFrame['type']]: … }`), so adding a frame cannot
    desynchronise the client's typing.
  - `modules/<name>/errors.ts` — the domain's error table (`<Domain>Errors`: every
    `Domain::Cause` bound to its HTTP status) plus its derived code union
    (`<Domain>ErrorCode`). The api binds factories to it via `defineErrors`.
  - `shared/http.ts` — the response envelope (`ApiResponse<T>` / `PageMeta` / `ApiError`);
    `shared/base.ts` — `BaseEntity` (serialized `id`/`createdAt`/`updatedAt`);
    `shared/errors.ts` — `ErrorTable`/`ErrorCode` and the shared tables (`GatewayErrors`,
    `RequestErrors`, `RateLimitErrors`).

  The package has zero dependencies; its only runtime exports are the dependency-free error
  tables and wire enums.

  Both packages import it directly
  (`import { CreateRoadmapInput } from '@pollium/contracts/modules/roadmap/http'`); never
  re-declare a wire shape locally on either side.
- `domain/` — module-internal shapes the web never sees: entity `<Name>Fields` (Date-typed,
  consumed by `implements` on models, usually extending a contracts `<Name>Profile`), event
  payloads, query filters (transport-agnostic).
- `http/` — request-body DTOs for server-only modules the web does not consume yet (`ai`,
  `notifications`). When the web starts consuming a module, its DTOs move to `@pollium/contracts`.
- `types/` — ambient `.d.ts` augmentations (`EventMap`, `FastifyRequest`).

Reuse existing contracts before creating new ones. Don't declare types loose in the file that uses them.

**No inline object types.** Never write an inline object shape in a function signature,
variable annotation, or generic argument (e.g. `where: { orgId: number; userId?: number }`).
Give it a name and put it in the right `contracts/` file — internal shapes like a query filter
go in `domain/`. A parameter type is a contract; name it (`UsageFilter`) so it can be reused and
so the signature reads as intent, not structure. Inline unions of primitives/literals
(`'asc' | 'desc'`) are fine; object literals are not.

**4. Throw domain error factories from `defineErrors`.**
Never `throw new Error`. `RuntimeError(message, statusCode)` is the only thing the global error
handler maps to an HTTP status — but you don't pair the code with the status by hand at every
throw. Each domain's **error table** — every `Domain::Cause` bound to its status **once** —
lives in `@pollium/contracts/modules/<name>/errors.ts`: the codes travel on the wire, so the
table is wire vocabulary, and the contract derives a typed code union from it
(`ErrorCode<typeof AuthErrors>`) that the web can `switch` on. The api binds throwable
factories to the table with `defineErrors` (`@/shared/errors/defineErrors`). One source of
truth kills typos at compile time on both sides.

```ts
// @pollium/contracts/modules/auth/errors.ts
export const AuthErrors = {
    domain: 'Auth',
    causes: {
        Unauthorized: 401,
        InvalidToken: 401,
        InvalidCredentials: 401,
        EmailAlreadyRegistered: 409
    }
} as const satisfies ErrorTable;

export type AuthErrorCode = ErrorCode<typeof AuthErrors>;
```
```ts
// src/modules/auth/contracts/domain/errors.ts
import { AuthErrors } from '@pollium/contracts/modules/auth/errors';
import { defineErrors } from '@/shared/errors/defineErrors';

export const AuthError = defineErrors(AuthErrors);
```
```ts
throw AuthError.InvalidCredentials();   // → Auth::InvalidCredentials, 401
```

Each entry is a factory: calling it builds a fresh `RuntimeError` with the `Domain::Cause`
message and its status, so the status can't drift between throw sites and stack traces point at
the throw. Wire codes follow `Domain::Cause`. Server-only modules (`ai`, `notifications`,
`league`) and
codes that never cross the wire (`EventError`, `ConfigError`, `CryptoError`, `RouteError`)
keep their tables api-local — inline the table in the `defineErrors` call. Shared wire codes
live in `@pollium/contracts/shared/errors.ts` (`GatewayErrors`, `RequestErrors`,
`RateLimitErrors`). New error? Add a row to the right table, don't inline a string. A code
with a runtime suffix passes it as the factory's optional detail argument —
`ConfigError.MissingEnv('PORT')` → `Config::MissingEnv:PORT` — so nothing constructs
`RuntimeError` directly. The one subclass is `ValidationError`: it carries the per-field
message map and takes a template error for its code/status
(`new ValidationError(errors, PracticeError.ItemsNotReady())`; defaults to
`Request::ValidationFailed`). On the web, map codes to copy through the typed unions
(`Partial<Record<AuthErrorCode, string>>` — see `modules/auth/utils/error-messages.ts`), never
by matching raw strings.

**5. `shared/` never imports from `modules/`.**
Base classes, decorators, `RuntimeError`, `config` live in `shared/`. Domain-specific code —
including guards like `AuthenticatedRoute` — stays in its module. When `shared/` must "know" a
module type (e.g. typing `emit`), the module augments a **global interface** (`EventMap`) via
declaration merging; `shared/` does not import it. (See events.md, architecture.md.)

**6. Every entity extends `BaseModel`.**
It provides `id`, `createdAt`, `updatedAt`, and a `toJSON` that drops `@Hidden` fields. Don't
redeclare those columns or serialize by hand. Mark secrets with `@Hidden()` so they never reach
a response:

```ts
@Entity()
export default class User extends BaseModel implements UserFields{
    @Column({ type: 'varchar', unique: true }) email!: string;
    @Column('varchar') @Hidden() passwordHash!: string;
}
```
`implements <Fields>` ties the entity to its `domain/` contract so they can't drift.

**Enum columns are `simple-enum`, and adding a member is a real schema change.** On Postgres
TypeORM normalizes `simple-enum` to a **native enum type** named `<table>_<column>_enum`
(`chat_message_role_enum`), not to a varchar with a check constraint. Adding a member to the TS
enum is therefore DDL: `synchronize: true` emits `ALTER TYPE … ADD VALUE '<member>'` when the new
set is a superset of the old one, which is in-place and preserves existing rows — verified by
adding `ChatRole.Tool` and re-reading `pg_enum`. **Removing or renaming a member is not that
cheap**: TypeORM renames the old type to `…_old`, creates the new one, rewrites the column with a
`USING …::text::<newtype>` cast and drops the old type — which fails on any row still holding a
dropped value. Only append. Since there is no migrations directory, both paths run at boot against
whatever database the process points at, so treat a member removal as a change that needs a plan,
not a synchronize.

JSON columns follow `PracticeItem.content`: `@Column('simple-json')` with a typed union
(`ChatMessage.parts` is `@Column({ type: 'simple-json', nullable: true })`). Postgres stores it as
`text` and TypeORM serializes it, so a nullable JSON column costs existing rows nothing — no
backfill.

**7. Read env only through `config`.**
`@/shared/config` validates on load and **fails loud** — `required('X')` throws
`ConfigError.MissingEnv('X')` (→ `Config::MissingEnv:X`, 500) for a missing/empty var; `optional('X')` returns
`undefined`. Never read `process.env` directly in feature code. Add a new var to `config.ts`
(and `.env.example`) and read `config.yourKey`.

**8. No comments.**
The code must be legible on its own — names, types, and structure carry the meaning. If a
comment feels necessary, rename or restructure until it isn't. This includes doc-comments on
contracts and models. The one exception is a typia tag on a `@pollium/contracts` DTO field
(rule 3): machine-read schema, not prose — and only when the constraint genuinely must reach
both the api and web validators (`/** @format email */` on sign-in); value rules (lengths,
ranges, sizes) otherwise belong in the service.

**9. English everywhere.**
Identifiers, filenames, error messages, commit messages, and any comment — all English. No
mixed languages in source.

**10. Service-layer logic lives in a class, never a free-function module.**
Everything under a module's `services/` is a class with a default export — a `<Name>Service`
for a domain operation, or a supporting collaborator it delegates to (`ModelResolver`,
`SdkMapper`). Never export a bag of `export const fn = ...` helpers from `services/`; give the
behaviour a named class and instantiate it as a private field like the rest
(`#mapper = new SdkMapper()`). This holds even for stateless mappers — they are classes with
methods, not module-level functions. File name is PascalCase to match the class
(`SdkMapper.ts`), same as every other class file.

**11. Readability is the priority.**
Optimize every line for the next reader. Reach for the simplest form that works: one terse
cast (`x as object`) over a repeated verbose one (`x as Record<string, unknown>`), and inline
clarity over indirection or comments that only restate the code. When something unavoidable —
a type assertion, a framework workaround — would clutter the logic, keep it minimal and to the
side so the surrounding code still reads as intent.

**12. One component per file.**
A `.tsx` file declares exactly one component — the one its folder is named after — and exports
it. There is no such thing as a private second component living beside its parent: the moment a
piece of markup earns a name (a row, a column, a nav item, an inline SVG icon), it becomes its
own `ComponentName/index.tsx` and is imported by path, however small it is. A sub-part used by a
single module's component is a sibling folder in that module's `components/`
(`modules/home/components/LaunchpadRow/`); one used across modules goes in `shared/components/`,
icons in `shared/components/icons/`. Only non-component code may share the file: the component's
own props interface, and a trivial helper (a class-name builder) that nothing else uses —
anything reusable moves to `utils/`, and a shape two components pass between them moves to
`contracts/` (rule 3).

**13. Components and pages are default exports.**
Every component and page is declared as a `const` and default-exported on the last line:
`const HomeLaunchpad = () => { ... };` … `export default HomeLaunchpad;`. Never
`export const HomeLaunchpad = ...` — a file holds one component (rule 12), so the default export
*is* the file's identity, and consumers import it as `import HomeLaunchpad from
'@/modules/home/components/HomeLaunchpad'`. Named exports in a `.tsx` component file are for
non-components only: its props interface when another module needs it. Non-component modules
(hooks, utils, api clients, the router) keep their named exports — the default-export rule is
components and pages, not the whole `web` package.

## Formatting

Match the surrounding code. The house style, enforced across `api` and `web`:

- **4-space indentation.** No tabs.
- **Single quotes** for strings (`'button'`, not `"button"`). JSX attributes too: `data-slot='button'`.
- **No space before the opening brace**, and none after control keywords: `if(cond){`,
  `for(const x of xs){`, `function f(){`, `}catch(error){`. Not `if (cond) {`.
- **Semicolons** terminate statements.
- Declare a type/interface for a component's props instead of inlining a large intersection in
  the parameter list. Keep the destructured signature on as few lines as reads clearly.
- **One member per line in `interface` and object-`type` bodies.** Never collapse a declaration
  to a single line (`interface ChoiceOption{ id: string; text: string; }`) — every member gets
  its own line, however small the shape.
- **One property per line in object literals that carry a shape.** When the literal *is* the
  data — initial state, a config object, an entity patch, a returned aggregate — break it, one
  property per line, even if it would fit on one line. The diff then points at the property that
  changed and adding a key doesn't reflow the statement.

  ```ts
  const [data, setData] = useState<LaunchpadData>({
      workspaces: null,
      roadmaps: null
  });
  ```
  Inline stays valid when it doesn't cost readability: a literal that is incidental to the
  statement around it — a decorator's options (`@Column({ type: 'varchar', unique: true })`), a
  short spread update (`setData((prev) => ({ ...prev, workspaces }))`), a single-property
  argument. Readability decides, not a property count.
- **No `void` return annotations.** A function that returns nothing needs no return type —
  omit `: void` (and `: Promise<void>` on async functions); inference covers it. The single
  exception is a **declaration with no body** — an `abstract` method signature or an interface
  member — where there is nothing to infer from (`abstract process(data: T): Promise<void>;`).
- **Arrow functions** for definitions — components, hooks, handlers, helpers. Reserve the
  `function` keyword for cases that genuinely need hoisting or `this`. A component is
  `const Button = (props: ButtonProps) => { ... }`, not `function Button(...)`.
- **A block body with an explicit `return`, not a concise arrow body**, for anything past a single
  trivial expression. A composition of calls may stay concise (`const trim = (value: number):
  string => String(Number(value.toFixed(DECIMALS)));`); a body that *decides* something gets braces,
  because that is where the next edit lands and a concise body has to be rewritten first to accept
  one.

  ```ts
  export const optionLabel = (options: ChoiceOption[], id: string): string => {
      return options.find((option) => option.id === id)?.text ?? id;
  };
  ```
- **A guard clause, never a ternary, as the shape of a function.** A `?:` spanning the whole body
  reads as one expression and hides that there are two outcomes. Return the exceptional case first,
  leave a blank line, then return the real one — the blank line is what separates "what this rules
  out" from "what this does".

  ```ts
  export const formatScore = (score: number | null, maxScore: number | null): string => {
      if(score === null || maxScore === null){
          return '—';
      }

      return `${trim(score)} / ${trim(maxScore)}`;
  };
  ```
  A ternary is still right *inside* an expression, where both branches are values of the same thing
  (`content.unit === null ? '' : ` ${content.unit}``).
- **Braces on any body that does work; bare one-liners only for early returns.**
  `if(answer === null) return null;` stays on one line because it is an exit. A body that assigns,
  calls or loops gets braces even when it is a single statement:

  ```ts
  for(const question of source.questions){
      map[question.id] = defaultAnswer(question.content);
  }
  ```
- **A `case` puts its body on the next line.** Reading a switch is scanning the labels; a body
  sharing the label's line turns that column into prose. Break a long chain inside a case one call
  per line rather than letting it run past the label.

  ```ts
  switch(answer.kind){
      case QuestionType.SingleChoice:
          return optionLabel(options, answer.optionId);
      case QuestionType.MultipleChoice:
          return answer.optionIds
              .map((id) => optionLabel(options, id))
              .join(' · ');
  }
  ```
- **`async`/`await` with `try`/`catch`/`finally`, never `.then(onFulfilled, onRejected)`.** The
  two-callback form puts the failure path above the success path and makes `finally` a fourth
  indentation level for no reason. `catch` binds the cause as `unknown`.

  ```ts
  const answer = async (itemId: number, text: string) => {
      setSavingIds((current) => [...current, itemId]);

      try{
          await practiceApi.answer(session.id, { itemId, answer: { kind: QuestionType.ShortText, text } });
          setError(undefined);
      }catch(cause: unknown){
          setError(toError(cause));
      }finally{
          setSavingIds((current) => current.filter((id) => id !== itemId));
      }
  };
  ```
- **A helper only one hook uses lives inside it, declared above its first use.** Keeping it in the
  hook keeps the read local, but `const` is not hoisted: a helper called from a `useState` or
  `useKeyedState` initialiser runs during the first render, so declaring it below that call throws
  `Cannot access '<name>' before initialization` on mount and nowhere else. Order is load-bearing,
  not cosmetic. A helper a second module needs moves to `utils/` instead.

The `web` package uses **HeroUI v3** (`@heroui/react`) as its component library — import
components (`import { Button } from '@heroui/react'`) rather than generating/vendoring source.
HeroUI needs no `<Provider>`; its styles come from a single `@import "@heroui/styles"` in
`src/assets/styles/index.css`. Build local components on top of HeroUI's compound API; don't reintroduce a
`cn`/`cva` styling layer (HeroUI already ships `cn`/`tv` if ever needed).

## Response envelope

Handlers **return raw domain data**; `BaseController` wraps it. Never build the envelope by hand.

- Return a value → `200 { data: <value> }`.
- Return `undefined`/`null` → `204` with no body.
- Return a `Paginated` (`@/shared/controllers/Paginated`) → `200 { data: <items>, meta: { total, limit, offset } }`.
  Build it from `findAndCount` with the `Page` injected by `@Pagination` — see `ChatMessageService.history`.
- `@Status(code)` overrides the status for either branch (e.g. `@Status(201)` on `signUp`).
- Errors (from the global handler) → `{ error: <message> }` with the `RuntimeError` status;
  body-validation failures add `errors: { <field>: <message> }` (see `@Body` below).

```ts
@Route('/', 'POST')
@Status(201)
create(@CurrentUser() userId: number, @Body() body: CreatePollInput){
    return this.#service.create(userId, body);   // → 201 { data: poll }
}

@Route('/me', 'DELETE')
deleteProfile(@CurrentUser() userId: number){
    return this.#service.deleteProfile(userId);   // returns void → 204
}
```

Envelopes: `ApiResponse<T> = { data: T }`, `ApiError = { error: string }` (`@pollium/contracts/shared/http` — the single definition both `api` and `web` import).

## Middleware

`MiddlewareFn = (req, reply) => void | Promise<void>`. Reject by throwing a `RuntimeError`;
pass data to the handler by mutating `req` (e.g. `req.principal`). Attach with `@Middleware(fn)`
at class level (all routes) or method level (one route); class-level runs first. `BaseController`
async-wraps every middleware, so sync and async both work — do not remove that wrapping
(Fastify 5 hangs on a sync preHandler).

**Route gates are middleware; addressed-entity ownership is `@Owned`.** If a check gates a
route by who the caller *is* — "is authenticated", "is a member of this org", "is an
admin" — it belongs in a `middlewares/` guard, and the *whole* check lives there (the query
and the `throw`), not in a `requireX` service method the guard calls through to. The
precedents are `AuthenticatedRoute` and `OrganizationAdminRoute`. Keep guards self-contained:
don't add `requireAdmin`-style methods to a service just to have the middleware delegate to
them — that splits one responsibility across two files. If instead the check authorizes the
*entity the route addresses* ("this roadmap belongs to the caller"), don't hand-roll a
load → 404 → ownership → 403 prologue in every service method: the service implements
`getOwned(userId, id)` once (the `OwnedResolver<T>` contract) and the handler declares
`@Owned(Service)` so the entity arrives loaded and authorized — see "Parameter decorators".
Business rules that happen to also fail (e.g. "can't remove the last admin") stay in the
service; they are invariants of the operation, not route gates. Type `MiddlewareFn` handlers with the bare
`req` — a `FastifyRequest<{ Params }>` is NOT assignable to `MiddlewareFn` (parameter
contravariance), so narrow inside the body. A middleware reads a route param by casting the
bare `req.params` (e.g. `(req.params as { orgId?: string }).orgId`) and validating it with
`parseId` (`@/shared/controllers/parseId`); handlers use the `@NumericParam` decorator instead
(see below).

## Parameter decorators

Handlers do **not** take `req`/`reply`. They declare their inputs with parameter decorators,
and `BaseController` resolves each argument by position before calling the handler. This keeps
controllers declarative and moves id-parsing / principal-reading out of every call site.

| Decorator | Injects | Source |
|---|---|---|
| `@Owned(Service, param = 'id')` | the addressed entity, loaded and authorized for the current user | `@/modules/auth/middlewares/Owned` |
| `@CurrentUser()` | `number` (authenticated user id) | `@/modules/auth/middlewares/CurrentUser` |
| `@Body(validator?)` | request body DTO, validated + pruned when a typia validator is passed | `@/shared/controllers/RequestParams` |
| `@NumericParam(name)` | route param as a positive int id | `@/shared/controllers/RequestParams` |
| `@Pagination(options?)` | `Page` (`{ limit, offset }` from the query string) | `@/shared/controllers/RequestParams` |

```ts
@Route(roadmapRoutes.update)
update(@Owned(RoadmapService) roadmap: Roadmap, @Body() body: UpdateRoadmapInput){
    return this.#service.update(roadmap, body);
}
```

- `@Owned(Service, param = 'id')` resolves the entity a route addresses on behalf of the
  caller: it parses the route param itself (subsuming `@NumericParam` for that param, 400
  `Request::InvalidId`), reads the principal (401 `Auth::Unauthorized` — like `@CurrentUser`,
  it lives in the auth module and needs `AuthenticatedRoute`), and delegates to the service's
  `getOwned(userId, id)` — the `OwnedResolver<T>` contract (`shared/contracts/ownership.ts`),
  which loads (404 `<Domain>::NotFound`) and checks ownership (403 `<Domain>::Forbidden`).
  The handler and service then work with the entity; keep `@CurrentUser() userId` only where
  the operation needs the *actor* (`create`, `list*`). Convention: declare `@Owned` first in
  the parameter list — `BaseController` resolves params with `Promise.all`, so when several
  resolvers would fail, ordering keeps the response deterministic.
- `@Body() body: <Input>` validates **automatically**: the `autoValidateBody` plugin in
  `packages/api/vite.config.ts` reads the DTO name from the parameter annotation and injects
  `typia.misc.createValidatePrune<Input>()` at build time (before the typia plugin compiles
  it). The body is validated against the DTO (rules live as typia comment tags on the
  contract type) and **pruned of unknown keys**, so services receive a trusted, whitelisted
  object — safe for `Object.assign(entity, patch)`. An invalid body is rejected with
  `400 Request::ValidationFailed` and a `{ errors: { field: message } }` map that web forms
  already render. Controllers never write typia calls; the annotation is the contract. Two
  consequences to know: the parameter's type annotation must be the DTO's plain imported name
  (the plugin matches it syntactically), and validation exists only through the vite-node/vite
  pipeline — plain `tsc` sees an unvalidated `@Body()`, which is why dev/start must go through
  `vite-node`. A hand-passed validator (`@Body(fn)`) still works and takes precedence.
- `@NumericParam` rejects a missing/malformed id with `400 Request::InvalidId` (it calls
  `parseId`), so the service always receives a valid `number`. Never coerce ids with
  `Number(...)` — that yields `NaN`, which reaches the DB as a bare token and 500s.
- `@Pagination` parses `limit`/`offset` (defaults 50/0, `limit` clamped to 100 — both
  overridable via `PaginationOptions`) and rejects invalid values with
  `400 Request::InvalidPagination`. Services take the `Page` and never parse the query
  themselves; pair it with a `Paginated` return (see "Response envelope").
- `@CurrentUser` lives in the **auth** module (not `shared/`) because reading `req.principal`
  is auth-domain semantics, like `AuthenticatedRoute` that sets it. It throws
  `Auth::Unauthorized` when no principal is present, so only use it on routes guarded by
  `@Middleware(AuthenticatedRoute)`.
- The parameter's TypeScript type (`userId: number`) is your annotation; the resolver returns
  the runtime value. Need a raw param, query value, or anything else? Add a decorator by
  wrapping `createParamDecorator` (`@/shared/controllers/params`) around a
  `(req, reply) => value` resolver — that's the whole extension point.

## Commit messages

Conventional commits, **subject line only** — no body, no `Co-Authored-By` trailer:

```
feat(shared): typed config module with fail-loud env validation
refactor(api): auto-discover modules from the filesystem
```

## Naming quick reference

| Thing | Convention | Example |
|---|---|---|
| Controller | `<Name>Controller`, default export, in `controllers/` | `PollController` |
| Service | `<Name>Service`, one responsibility | `PollService`, `MailService` |
| Entity | singular, `implements <Fields>`, in `models/` | `Poll`, `UserSettings` |
| Request DTO | `<Verb><Noun>Input`, in `@pollium/contracts` (`http/` only for server-only modules) | `CreatePollInput`, `SignInInput` |
| Event payload | `<Event>Payload`, in `domain/` | `UserCreatedPayload` |
| Error table | `<Domain>Error` via `defineErrors`, codes `Domain::Cause` | `AuthError.InvalidToken()` |
| Queue | `<Name>Queue extends BaseQueue<T>`, in `queues/` | `SMTPQueue` |
| Event group | `<Domain>Events`, `@DefineEventGroup('<domain>')`, in `events/` | `UserEvents` |
| React component | `PascalCase`, one per file, one per folder as `ComponentName/index.tsx`, default export | `Button/index.tsx`, `NoteList/index.tsx` |
| Class | `PascalCase` file matching the class, in both packages | `SdkMapper.ts`, `SocketChannel.ts` |
| Hook / non-component module (`web`) | `kebab-case` file; never `camelCase` | `use-notes.ts`, `error-messages.ts`, `parse-route-file.ts` |
| Hook / non-component module (`api`) | `camelCase` file, matching the export | `parseId.ts`, `defineErrors.ts` |

### File naming, spelled out

Two rules cover every file:

```
Component or class  →  PascalCase   (Button/index.tsx, SocketChannel.ts, ApiError.ts)
Everything else     →  kebab-case   (use-session.ts, parse-route-file.ts, error-messages.ts)
Never               →  camelCase.ts
```

Three things this does **not** change:

- **Components keep the folder form.** `Button/index.tsx` already satisfies "PascalCase for
  components" — the folder is the name (rule 12). Flattening to `Button.tsx` is not part of this
  convention.
- **Exports keep their own casing.** Only the filename is kebab-case; `useSession` is still
  exported as `useSession` from `use-session.ts`.
- **`pages/` is exempt, and this is load-bearing.** Every page file must be named `index.tsx`
  because `app/routes.ts` discovers routes with `import.meta.glob` on
  `pages/{guest,protected,admin}/**/index.tsx` — rename one and it silently stops being a route,
  with no error. The `PascalCase` folders under `pages/` are the *input* to `toSegment`/`toKebab`,
  which turn `pages/protected/Settings/Providers/index.tsx` into `/settings/providers`. They are
  not an inconsistency to tidy.

**Enforcement.** `packages/web/.oxlintrc.json` runs `unicorn/filename-case` with
`case: kebabCase` and `ignore: ["^index\\.tsx?$", "^[A-Z]"]`, so `index.tsx` files and
PascalCase components/classes are exempt while `useSession.ts` and `use_session.ts` are both
errors. oxlint prints the target name in its help line. The rule is checked by `pnpm --filter web
lint`; prose alone decays, so if you are tempted to relax it, change the rule and the tree
together.

**`api` deliberately diverges, and that is a decision, not an oversight.** The api keeps
`camelCase` for non-class files (`parseId.ts`, `parsePagination.ts`, `registerEventGroup.ts`), so
`shared/errors/defineErrors.ts` in the api is `shared/errors/define-errors.ts` in the web. The
kebab-case rule was adopted for the web's file-tree readability and its machine enforcement lives
in the web's oxlint config. The api runs oxlint too (`pnpm --filter @pollium/api lint`, wired into
CI) but has no `.oxlintrc.json` of its own, so it inherits no `unicorn/filename-case` rule — the
enforcement is web-only, not the linter itself. Widening it to the api is a separate change —
until someone makes it, expect the same concept to spell its filename differently on either side
of the wire.
