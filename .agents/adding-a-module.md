# Adding a module

A module is a folder under `src/modules/`. Create it, drop default-exported classes into the
category folders, and the bootstrap discovers everything — no registry to edit. This is the
full recipe with a minimal working example.

## The category folders (all optional)

```
src/modules/<name>/
    controllers/   # default-export class extends BaseController → routes mounted at /<name>
    models/        # default-export TypeORM entity extends BaseModel → registered on the DataSource
    services/      # business logic (imported by controllers/events; NOT auto-discovered)
    events/        # default-export @DefineEventGroup class → subscribed to the bus
    queues/        # default-export BaseQueue subclass → worker started at boot
    gateways/      # default-export BaseGateway subclass → WebSocket channel mounted at its @Channel path
    tools/         # default-export @DefineToolGroup class → AI tools registered on the tool registry
    middlewares/   # module-owned guards, referenced via @Middleware (NOT auto-discovered)
    contracts/
        domain/    # internal types, event payloads (transport-agnostic; the web never sees these)
        http/      # request-body DTOs — only while the module is server-only; once the web
                   # consumes it, DTOs and wire shapes move to @pollium/contracts/modules/<module>
        types/     # .d.ts ambient augmentations (EventMap, FastifyRequest, …)
```

Only `controllers/`, `models/`, `events/`, `queues/`, `gateways/`, `tools/` are scanned, and only
their files' **default export** is picked up. `services/`, `middlewares/`, `contracts/` are ordinary
code imported by the discovered classes.

**A tool's name is composed by its decorators, so it is not greppable.** `@DefineToolGroup('course')`
on the class plus `@Tool({ … })` on a method called `lessons` produces the tool `course_lessons`, and
that string appears nowhere in the source. Searching for a tool name finds the call sites and the
tests, never the definition — look for the group instead. The same is already true of
`@DefineEventGroup` + `@Event`. The separator is an **underscore**, not a dot: `ToolRegistry` builds
`${group}_${method}` and validates it against `/^[a-zA-Z0-9_-]+$/`, which a dot would fail.

**A `ToolAccess.Write` tool needs three lines on the web, or it half-works.** `ToolRegistry.approvals()`
marks every write tool `'user-approval'`, so the SDK pauses and the learner has to approve it in the
chat. The client cannot infer that from a persisted `tool-call` part — a read call and a paused write
call are recorded identically — so adding a write tool means adding its name to `WRITE_TOOLS`
(`web/src/modules/chat/utils/write-tools.ts`) and its running/done/ask phrasing to `toolCopy`
(`utils/tool-copy.ts`). Skip the first and the live approval card still appears but is **not
reconstructed after a reload**, leaving the generation paused with no way to answer it; skip the second
and the learner reads a neutral fallback. A tool that deserves a richer card than the generic one gets
one entry in the `CARDS` map in `components/ToolApproval/index.tsx`.

**Generated content going back to a model is untrusted, and there is one helper for it.** A lesson
body, a note or a deck's source was written by a model from a learner's free-text topic, so returning
it to the tutor round-trips text that has already been through an LLM once — and because it is
*stored*, a jailbreak in a course topic fires again on every later read. Wrap it with
`untrustedMaterial(body, max)` (`@/shared/utils/untrustedMaterial`) rather than interpolating tags by
hand: it bounds the text **and** strips any `<material>`/`<topic>` tag out of the body first, so the
content cannot close the delimiters that are supposed to contain it. The bound always comes from
`config` (`chat.maxToolChars`, `roadmap.maxLessonChars`,
`presentation.maxSourceChars`), never a literal. On the presentation side the stripping happens once in
`SourceResolver`, because every prompt builder there reads its `SourceMaterial`.

**Prompts are ordered static-first, dynamic-last.** Providers cache byte-identical prompt prefixes,
so a per-request value (an audience, a count, a card intent) placed early in a system prompt makes
every request pay for the instructions that follow it. A prompt builder keeps its fixed instruction
text — including the response shape — at the front, and interpolates request-specific lines at the
end of the system and in the user message. Never put a timestamp or generated id into a prompt. What
the provider actually cached lands in `TokenUsage.cachedTokens` and shows up on the usage dashboard;
a repair turn (a structured retry after a validation failure) is marked with `repairs` on the same
row, so both have their own column per purpose.

## Recipe: a `poll` module with one endpoint

**1. Entity** — `src/modules/poll/models/Poll.ts`. Extend `BaseModel` (gives `id`,
`createdAt`, `updatedAt`, `@Hidden`-aware `toJSON`). Implement its fields contract.

```ts
// src/modules/poll/contracts/domain/poll.ts
import type { BaseFields } from '@/shared/contracts/base';

export interface PollFields{
    question: string;
    ownerId: number;
}
export type PublicPoll = PollFields & BaseFields;
```

```ts
// src/modules/poll/models/Poll.ts
import { Entity, Column } from 'typeorm';
import BaseModel from '@/shared/models/BaseModel';
import type { PollFields } from '../contracts/domain/poll';

@Entity()
export default class Poll extends BaseModel implements PollFields{
    @Column('text') question!: string;
    @Column('integer') ownerId!: number;
}
```

**2. Request DTO** — `src/modules/poll/contracts/http/poll.ts`:

```ts
import type { PollFields } from '../domain/poll';
export type CreatePollInput = Pick<PollFields, 'question'>;
```

**3. Service** — `src/modules/poll/services/PollService.ts`. All business logic. Throw domain
error factories from `defineErrors` (declare them in `contracts/domain/errors.ts`).

```ts
import Poll from '../models/Poll';
import type { CreatePollInput } from '../contracts/http/poll';

export default class PollService{
    create(ownerId: number, input: CreatePollInput): Promise<Poll>{
        return Poll.create({ question: input.question, ownerId }).save();
    }
}
```

**4. Controller** — `src/modules/poll/controllers/PollController.ts`. Default export, extends
`BaseController`, translates HTTP ↔ service and nothing more. It mounts at `/poll` because the
folder is `poll`. Guard it with `@Middleware(AuthenticatedRoute)` for auth; use `@Status` for
non-200 success. Handlers declare their inputs with parameter decorators (`@CurrentUser`,
`@Body`, `@NumericParam`, …) rather than touching `req` — see conventions.md.

```ts
import BaseController from '@/shared/controllers/BaseController';
import { Route } from '@/shared/controllers/Route';
import { Status } from '@/shared/controllers/Status';
import { Middleware } from '@/shared/middlewares/Middleware';
import { Body } from '@/shared/controllers/RequestParams';
import { AuthenticatedRoute } from '@/modules/auth/middlewares/AuthenticatedRoute';
import { CurrentUser } from '@/modules/auth/middlewares/CurrentUser';
import PollService from '../services/PollService';
import type { CreatePollInput } from '../contracts/http/poll';

@Middleware(AuthenticatedRoute)
export default class PollController extends BaseController{
    #service = new PollService();

    @Route('/', 'POST')
    @Status(201)
    create(@CurrentUser() userId: number, @Body() body: CreatePollInput){
        return this.#service.create(userId, body);
    }
}
```

**5. Run it.** No registration step. `npm run typecheck`, then `npm start` — `POST /poll`
exists and returns `201 { data: <poll> }`. Done.

## Conventions the example encodes

- **Return raw domain data** from handlers (`Poll`, arrays, objects). The base class wraps it
  as `{ data: ... }`. Return nothing → `204`. Never build the envelope yourself. (conventions.md)
- **`@CurrentUser() userId: number`** injects the authenticated user id, set by
  `AuthenticatedRoute`. It only works on routes guarded by that middleware. Path ids come from
  `@NumericParam('id')`, the body from `@Body()` — handlers never read `req` directly.
  (conventions.md → Parameter decorators)
- **Contracts split**: entity/domain shapes in `domain/`; request bodies in `http/` while the
  module is server-only, in `@pollium/contracts/modules/<module>` once the web consumes it (see
  conventions.md rule 3). Reuse existing contracts before adding new ones.
- **Entity fields contract**: `implements PollFields` keeps the entity and its type in sync.

## If your module needs events or queues

- Reacting to something happening elsewhere (e.g. `user.created`)? Add an `events/` group → **events.md**.
- Doing slow/retryable background work (email, external calls)? Add a `queues/` class → **queues.md**.

The `user` module is the fullest real example: two controllers (`/user/me`, `/user/me/settings`),
a `user.created` event group that provisions settings, models with a `@OneToOne` relation, and
the full contracts split. Read it when in doubt.

## Anti-patterns (do NOT do these)

- **No `index.ts` / registry / `ModuleDefinition`** per module. Discovery is by folder.
- **No business logic in controllers** — delegate to a service.
- **No hand-rolled authorization prologues** — role/membership route gates ("is a member",
  "is an admin") are self-contained `middlewares/` guards, not `requireX` service methods;
  ownership of the entity a route addresses is `getOwned(userId, id)` on the service, resolved
  at the edge by the `@Owned(Service)` decorator. See conventions.md.
- **No `throw new Error`** — throw a domain error factory from `defineErrors`.
- **No importing a module's types into `shared/`** — augment a global interface instead.
- **No reading `process.env` directly** — add the key to `@/shared/config` and read it there.
