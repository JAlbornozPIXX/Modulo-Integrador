src/
│
├── app/                    # composition root: it may import shared/ AND modules/
│   ├── alova.ts            # the http client (reads the session token)
│   ├── routes.ts           # folder discovery of pages/
│   ├── router.tsx          # tier guards + layouts wired around the discovered routes
│   ├── lazy-element.tsx
│   └── layouts/            # chrome the router wraps a tier with (DashboardLayout/)│
├── modules/
│   ├── auth/
│   │   ├── api/
│   │   ├── components/     # incl. the tier guards (GuestGuard, ProtectedGuard)
│   │   ├── hooks/          # incl. useSession
│   │   ├── pages/
│   │   └── utils/
│   │
│   ├── user/
│   │   ├── api/
│   │   └── …
│
├── shared/                 # may import ONLY shared/. NEVER app/ or modules/
│   ├── api/                # call()
│   ├── components/
│   ├── contracts/
│   ├── errors/             # defineErrors + ClientError for client-local codes
│   ├── hooks/
│   ├── services/
│   ├── store/              # session token — shared owns it, modules drive it
│   └── utils/
│
└── assets/

There is **no per-module `index.ts`**: a module is its folders, imported by path.

## The one hard boundary

```
app/      → may import shared/ and modules/ (it composes them)
modules/  → may import shared/ and (sparingly) other modules/
shared/   → may import ONLY shared/. NEVER app/ or modules/.
```

Same rule as the api (conventions.md rule 5). It decides where a piece lives: a component that
reads domain state belongs to that domain's module (`SessionAvatar` in `auth`,
`OrganizationSwitcher` in `organizations`), and chrome that composes several modules is
`app/layouts/`, not `shared/components/`. The one exception is the session token: it is
infrastructure every request and socket needs, so `shared/store/session.ts` owns it and the auth
module writes to it.

### Reach for the shared primitive before writing the pattern again

These exist because the same shape was written three or more times before being promoted. Adding a
fourth copy is the mistake, not the extraction:

| Need | Use | Not |
|---|---|---|
| Wire error code → user copy | `errorCopy(messages)` (`shared/utils/error-copy`) | a per-module `if/else` or a fresh resolver |
| Destructive confirmation | `ConfirmDialog` (`shared/components/ConfirmDialog`) | a `Modal` with hand-rolled Cancel/Delete |
| N loading placeholders | `skeletonKeys(count)` (`shared/utils/skeleton-keys`) | `const KEYS = ['a','b','c']` |
| State that resets when a subject changes | `useKeyedState(key, initial)` (`shared/hooks/use-keyed-state`) | a `loadedFor` companion state |
| `:id` from the URL | `parseRouteId` (`shared/utils/routing/parse-route-id`) | `Number(useParams().id)` |

**Type an error map against the code union, never `string`.** `errorCopy` is generic in the code
type, so pass the real union — `Partial<Record<WorkspaceErrorCode | OrganizationErrorCode, string>>`.
Keyed by `string`, a typo'd code compiles and silently degrades to the fallback; keyed by the union,
it fails the build. The one place `Record<string, string>` is correct is `useForm`'s
`submitErrorMessages`, because `shared/` cannot know a module's codes — shared accepts the wide type,
the module declares the narrow one.

**`parseRouteId` returns `undefined`, not `null`,** so it drops straight into `useQuery(api.get,
[id])` — which stays idle on an `undefined` argument — instead of needing a `?? undefined` at every
call site.

**An invariant belongs next to the resource it protects.** The chat stream must be the only consumer
of `/chat/stream`, because `ChannelPool` shares one socket per path and two consumers would trade the
join back and forth. That guard lives in the pool (`acquire(path, isExclusive)`), which already
refcounts, rather than as a second counter in the chat module.

### The session survives a reload

`shared/store/session.ts` hydrates the token from `localStorage` (`pollium.session`, the same
`pollium.*` convention as `theme.ts`) **in the store initialiser, synchronously**. That is
load-bearing, not incidental: `ProtectedGuard` redirects on the first render when
`isAuthenticated` is false, so hydrating in an effect would trade a reload-signs-you-out bug for
an intermittent redirect race. Keep the read synchronous.

Ending a session is `endSession()` (`@/shared/services/end-session`), never a bare
`setToken(null)`: it clears the store, drops the persisted key and invalidates the alova GET
cache. That last part matters because the cache is keyed by URL and not by token, so a stale
`/user/me` would otherwise be served to whoever signs in next within the 30s window.

The interceptor ends the session itself when the api rejects the token — `isSessionExpired`
gates on the **error code**, not the status, and only `Auth::Unauthorized` and
`Auth::InvalidToken` count. Several other 401s exist (`User::InvalidPassword`,
`Auth::InvalidCredentials`, `OAuth::StateMismatch`), and signing the user out because they typed
their current password wrong is a bug. Nothing navigates on sign-out: the token drops, the guard
sees it and redirects.

## Wire types come from `@pollium/contracts`

Anything that crosses HTTP — request DTOs (with their validation rules as typia comment
tags), serialized entity shapes (`Roadmap` with `createdAt: string`), the
`ApiResponse<T>` / `ApiError` envelope —
lives in `packages/contracts` and is imported directly — entities and wire enums from
`@pollium/contracts/modules/<name>/domain`, request DTOs from
`@pollium/contracts/modules/<name>/http`, endpoints from
`@pollium/contracts/modules/<name>/routes`. A module's `api/api.ts` never hand-writes a URL:
it calls `call(roadmapRoutes.create, { body })` (`@/shared/api/call`), which derives method,
path, and response type from the route table the api itself mounts. Form validation compiles
the DTO types into runtime validators with `typia.createValidate<T>()` (their rules are typia
comment tags on the type itself), and `useForm` takes that validator. Never re-declare a
server-owned shape under a module; the web's own `shared/contracts/` holds only
client-side concerns (form state, routing, channel/socket types, error boundaries).

### Typing a gateway channel

`useChannel(path, handlers)` is only as typed as `ChannelMap` makes it. `HandlersFor<P>` falls
back to `ChannelHandlers` — every payload `unknown` — for any path that is not a key of
`ChannelMap`, and `ChannelMap` ships empty:

```ts
export interface ChannelMap{}
```

It is a declaration-merging target, and the module that owns the channel fills it in. The frame
types come from `@pollium/contracts/modules/<name>/gateway`, and the augmentation lives in the
module, never in `shared/` — `shared/` must not learn about `modules/`:

```ts
// modules/chat/contracts/channel.ts
import type { ChatStreamFrames } from '@pollium/contracts/modules/chat/gateway';

export const CHAT_STREAM_PATH = '/chat/stream';

declare module '@/shared/contracts/channel'{
    interface ChannelMap{
        '/chat/stream': ChatStreamFrames;
    }
}
```

Two things to know:

- **The augmentation applies program-wide without being imported**, because `tsconfig.app.json`
  has `include: ["src"]`, so the file is in the program. Exporting the path constant anyway gives
  callers `useChannel(CHAT_STREAM_PATH, …)` and one place to change the path.
- **Inbound and outbound frames are shaped differently, and both are correct.** Inbound is
  `{ type, data }` and `SocketChannel` hands `frame.data` to handlers. Outbound is *flattened* —
  `send(type, data)` serialises `{ type, ...data }` — so `send('session.join', { sessionId })` puts
  `sessionId` at the frame root, which is what the api's `@Payload()` reads. Do not "fix" the
  asymmetry on one side only.

A regression here is silent: without the augmentation the handlers still compile, they just take
`unknown`. Assert it instead — a test whose handler parameters are *inferred* (`(data) =>
data.token`) fails to compile if the map is missing, and a `@ts-expect-error` on a frame name the
gateway never sends fails if the name is somehow accepted.

### Carrying an action across a navigation

Home's composer creates a session and then has to get the user's typed message sent from a *different
screen*, after a socket opens and a join is acknowledged. Two rules make that honest:

- **Carry the payload in router state, and clear it immediately.** `navigate(path, { state: { pending } })`
  then a `replace` to the same path on arrival. Without the clear, a reload replays the state and the
  message is sent twice.
- **A submit that can fail must not clear its input.** `onSubmit` returns `Promise<boolean>` and the
  composer clears only on `true`. Clearing optimistically and restoring on failure looks the same
  when it works and loses the user's text when it does not — and the failure here is a real one
  (no organization, no provider, a 403).

**Prefer deriving "is this settled?" over a callback that clears state.** The optimistic first turn is
shown while `pending !== undefined && !transcript.messages.some(isUser)`. The callback version — the
stream telling the page to clear the bubble when the echo arrives — needs the page's `onMessage` to
close over a hook declared after it, which is a use-before-declaration knot for no benefit. Derived
state has no ordering problem and disappears at exactly the right moment.

### Joining a room needs an acknowledgement, not hope

`ChatGateway` keeps the joined session on the socket, so a client must `session.join` before it may
`message.send`. It is tempting to just send them back to back — WebSocket delivery is ordered, after
all. **The server does not process them in order.** `BaseGateway` dispatches without awaiting:

```ts
socket.on('message', (raw: Buffer) => void this.#dispatch(socket, req, raw.toString()));
```

`join` awaits a database read before registering the socket, so a `message.send` arriving right
behind it runs first and throws `Chat::NotJoined`. No amount of client-side ordering fixes that.

The acknowledgement costs nothing to add, because `#dispatch` already echoes whatever a handler
returns back to the sending socket:

```ts
const result = await this.#invoke(handlerName, socket, req, frame);
if(result !== undefined && result !== null) this.#send(socket, { type: frame.type, data: result });
```

So a handler that returns `{ sessionId }` produces a `session.join` frame on the client with no new
machinery — the ack shares the request's type name because that is what the echo does. **A gateway
handler whose completion the client must observe should return its result rather than `void`.**

The client rule that follows: `joined` is state set by the ack, never assumed after sending the join,
and it is cleared the moment `status` leaves `'open'`. Clearing on disconnect is what makes the
re-join happen — the server's `#joinedSessions` is a `WeakMap` keyed by the *old* socket, so a
reconnected client is connected and not joined, and without the reset every later send fails.

### Reading a paginated feed the user reads from the end

A transcript is the one list where page 1 is the *wrong* page: the user cares about the newest
message, and `offset: 0` on an ascending read is the oldest. The rule is **the api serves the
window the reader wants**, newest first, and the client reverses for display. The alternative —
asking for `total` and computing `offset = total - limit` — costs a round trip on every open and
puts the arithmetic in the component.

`chatRoutes.history` is therefore newest-first, and `useTranscript` accumulates windows into one
ascending list. Three things that fall out of it, worth knowing before writing the next one:

- **The service keeps two reads, not one flag.** `ChatMessageService.history` stays ascending
  because `ChatHistoryWindow` builds the tutor's memory from it and depends on the order twice:
  `opening.items[0]` is the pinned first turn of the conversation, and `offset: total - size + 1`
  is the tail. Flipping the shared method would corrupt the model's memory silently — verified by
  flipping it and watching `ChatStreamService`'s "keeps the opening goal" test fail. So the reader
  gets its own `latest()`; the two callers want genuinely different things and the names say so.
- **Offset paging is safe here, and it is worth knowing why.** Appending a message only pushes
  existing rows to later indices, so a stale offset re-returns rows already on screen — overlap,
  never a gap. Merging by id absorbs it. That stops being true the day a message can be
  *deleted*, which is when this needs cursors (`before=<id>`).
- **Merge by id, never by position, and let the incoming copy win.** One id arrives from two
  places — the fetched window and a `message.created` frame — and a refetch should be able to
  correct what is on screen.

Reset accumulated state when the subject changes by comparing against a state variable during
render (`if(loadedFor !== sessionId){ … }`), not in an effect. An effect resets *after* a render
that already painted the previous session's messages, and it fires a second request for the window
you are about to discard.

### Two things `useForm` guarantees, so callers don't reinvent them

- **`setValues(patch)` clears the errors of the fields it writes**, and deliberately does *not*
  mark them touched. A value the app filled in — a suggestion, a default, a prefill — must never
  render as an error the user did not cause, and a `Required` left over from an earlier failed
  submit must not sit on top of a field that now has a value. It does not re-validate: the next
  change or blur does that.
- **A submit error can point at a field, not just the banner.** `submitErrorMessages` maps a wire
  code to copy; `submitErrorFields` maps the same code to the field it belongs to, and the error
  lands on both. That is how `Auth::UsernameAlreadyTaken` marks the username input instead of only
  raising a banner. Map every code of a domain's `<Domain>ErrorCode` union that a form can
  provoke — an unmapped code falls through and renders the raw `Domain::Cause` string to the user.

A programmatic fill should only ever write **empty** fields, so it cannot overwrite what the user
typed or what a password manager already filled — see
`modules/auth/utils/suggest-from-email.ts` and its use in `use-identifier-flow.ts`, which derives
a full name and username from the address at the step where it is known to be valid and free.
Sign-up inputs carry `autoComplete` (`email`, `name`, `username`, `new-password`) so a manager
fills them without fighting the form.

## Reads go through `useQuery`, writes through the api call

`useQuery` (`@/shared/hooks/api/use-query`) is the only way the app reads: hand it a request from
a module's `api` object plus the arguments it takes. An argument still `undefined` — because the
query producing it has not answered yet — keeps the request idle, so a dependent read needs no
effect of its own, and `dependsOn` makes the upstream query's loading, failure and retry flow
through. Writes are a plain `await noteApi.create(values)` in the handler; wrap one in
`useMutation` only for what a call cannot carry itself: the in-flight state a component renders,
or the query to reload once it lands. Nothing else fetches — no `useEffect` + `setState`, no
`alova/client` hooks.

```ts
export const useCourses = (): Query<CourseSummary[]> => {
    const organization = useCurrentOrganization();
    return useQuery(workspaceApi.courses, [organization.data?.id], { dependsOn: organization });
};
```

### Paginated routes return `PageOf<T>`

The api answers a `@Pagination()` handler with `{ data, meta }` (`meta` being
`{ total, limit, offset }`), and the interceptor turns that into a
`PageOf<T>` — `{ items, meta }` — instead of dropping the metadata. So a paginated route
declares the page as its output, not the array:

```ts
history: get<PageOf<ChatMessage>>('/chat/sessions/:sessionId/messages')
```

`useQuery(chatApi.history, [sessionId])` is then `Query<PageOf<ChatMessage>>` and
`data.meta.total` is the real total, not the row count of the current page. Derive page numbers,
the shown range and next/previous with `pageNavigation(meta)` (`@/shared/utils/pagination`) —
don't re-do `Math.ceil(total / limit)` per call site. A caller that only wants the rows projects
them: `select: (page) => page.items`.

Two rules follow from this:

- **Declare `PageOf<T>` only for a handler that really is paginated.** The returned type is a
  claim about a runtime shape: the interceptor branches on `meta` being present, and the api emits
  `meta` only for a `Paginated` result. A route typed `PageOf<T>` whose handler is not paginated
  (or the reverse) mismatches silently. The `@Pagination()` handlers are the complete, greppable
  list.
- **Don't add a `meta` field to `Query`.** It would be `null` for every non-paginated endpoint and
  would push pagination into a generic that has no reason to know about it.

A module hook exists to hold **policy**, not to rename `useQuery`:

- **Write it when it adds policy**: `select`, `dependsOn`, `enabled`, derived arguments, or
  mutations that reload their list. `useCourses` owns "courses are scoped to the current
  organization", so no page re-decides that.
- **Skip it when it only forwards**: a detail page calls `useQuery(noteApi.get, [id])` directly;
  a `useNote` wrapper adds nothing.
- **Return `Query<T>` / `Mutation<A, O>`** (`@/shared/contracts/api`) or a record of them, never
  a bespoke shape. A `{ courses, error, retry }` forces every page to learn a different contract
  per module. `useSession` is the one exception — it maps to `Session` because guards consume
  `isAuthenticated`/`isAdmin`, which is domain derivation, not renaming.

## `pages/` access tiers

A module's `pages/` is split by the access level required to reach the route, so the
guard a page needs is obvious from its path. Each page is a `PageName/index.tsx` folder
(see the component naming rule in conventions.md):

- **`guest/`** — reachable only when signed OUT. Redirect to the app if already authenticated.
  (sign-in, sign-up, forgot-password.) e.g. `pages/guest/SignIn/index.tsx`.
- **`protected/`** — requires an authenticated session. Redirect to sign-in when signed out.
- **`org-admin/`** — requires a session AND the `Admin` role in the current organization. The
  strictest tier. e.g. `pages/org-admin/Providers/index.tsx`.

Not every module uses all three; create only the tiers a module actually has. The tier
directory drives which route guard wraps the page, so membership in `guest/` vs `protected/` vs
`org-admin/` is the single source of truth for a page's access rule — don't re-encode it per-page.
Adding a tier means touching three places at once: the `RouteTier` union
(`shared/contracts/routing/route.ts`), the `import.meta.glob` patterns in `app/routes.ts`, the
`ROUTE_FILE` regex in `parse-route-file.ts`, and the composition in `app/router.tsx`. Miss the glob
and the page is silently not a route at all.

### A `layout.tsx` is chrome several sibling routes share

A page file is `index.tsx`; a `layout.tsx` beside it is the chrome its neighbours share, and it
renders `<Outlet />`. Both parse to the **same route path** — `parseRouteFile` tells them apart by
filename and returns a `kind` (`'page' | 'layout'`) — and `app/router.tsx` nests them by one rule:

> A layout owns the page at its own path, which becomes its `index` route, and the pages exactly
> one segment below it. Anything deeper stays outside.

That is what makes `Courses/[courseId]/layout.tsx` wrap the course's tabs
(`/courses/:courseId` plus `files`, `decks`, `podcasts`, `notes`, `highlights`) while
`/courses/:courseId/lessons/:lessonId` — two segments down — keeps its own chrome. The tabs stay
real URLs, and the sidebar keeps its place because the layout does not remount when a tab changes.

Two consequences worth knowing:

- **The rule lives in the router, not in the page files**, so adding a page is what silently
  breaks it. `app/tests/router.test.ts` pins the tree; it fails if a layout starts swallowing its
  whole subtree.
- **A layout and its index page share a path**, so route discovery's duplicate check is keyed by
  `kind` *and* path, and `registerRouteLoader` accumulates loaders per path instead of overwriting
  — one path needs both chunks.

A layout is not a tier. Adding a **tier** still means touching the `RouteTier` union, the glob
patterns, the `ROUTE_FILE` regex and the router composition together.

### Dynamic segments

A folder named `[param]` becomes `:param`; every other folder is kebab-cased. So
`modules/workspaces/pages/protected/Courses/[id]/index.tsx` is `/courses/:id`, and it coexists
with `Courses/index.tsx` at `/courses` because React Router ranks the static segment higher. Two
things travel with a dynamic page:

- **Validate the param before it reaches a request.** `useParams()` hands back a `string |
  undefined` straight from the URL. Run it through `parseRouteId`
  (`@/shared/utils/routing/parse-route-id`), which returns `number | null`, and render `NotFound`
  for `null`. Coercing with `Number(...)` instead sends `NaN` down the wire and turns a typo in
  the address bar into a 400 rendered as a generic error.
- **Branch after the hooks, never before them.** `react/rules-of-hooks` is an error, and the id
  can change while the component stays mounted. Call `useQuery` with `id ?? undefined` — an
  `undefined` argument keeps the request idle — and put the `return <NotFound />` below every hook.

A guard lives in the module that owns the state it reads: `GuestGuard`/`ProtectedGuard` are
auth-domain (`modules/auth/components/`), `OrgAdminGuard` is organization-domain
(`modules/organizations/components/`). All are composed in `app/router.tsx`, and **`org-admin`
nests inside `ProtectedGuard`** — a role check with no session would render "forbidden" to a
logged-out visitor instead of sending them to sign-in with `next` preserved.

### Organization roles

An organization role is **not** session-global: the same user can be `Admin` of one org and
`Member` of another, so there is no `isAdmin` on `Session` and there must not be one. (If a
platform-wide concept is ever needed it arrives as `isPlatformAdmin`, so the two can never be
confused at a call site.) The role rides along on the payload the app already fetches —
`organizationRoutes.mine` returns `OrganizationWithRole[]` — so no extra request exists to ask
"am I an admin?".

Everything derives from one source, and nothing else reads memberships:

| Need | Use | Shape |
|---|---|---|
| the role itself, with loading/error | `useOrgRole()` | `Query<OrganizationRole \| null>` |
| may I do this? (components, actions) | `useIsOrgAdmin()` | `boolean` |
| hide a control | `<RequireOrgAdmin>` | renders children or nothing |
| gate a route | the `org-admin/` tier | `OrgAdminGuard` |

Two rules travel with the component-level primitives:

- **Hiding UI is not authorization.** The api enforces `OrganizationAdminRoute` regardless, and a
  user who types the URL must reach a real forbidden state. The primitive exists so dead controls
  aren't shown, not to protect anything.
- **Never flash.** `useIsOrgAdmin()` is `false` while the role is loading, on purpose: a gated
  control that appears a beat late is fine, one that appears and vanishes reads as a bug. Don't
  "fix" it by rendering a placeholder that disappears.

The role follows whichever organization is active, and `useCurrentOrganization` is still
`organizations[0]` because switching is not real state yet. That is exactly why the role is derived
on every read instead of copied into the session — when the switcher becomes state, `useOrgRole`
moves with it and no cached boolean goes stale.
