# Events

An in-process, typed event bus for cross-module side effects. A module emits
`eventBus.emit('group.event', payload)`; any module can subscribe a handler. Emitting is
**fire-and-forget and error-isolated** — the emitter never waits and a failing handler never
breaks the caller.


## Naming convention

Event keys are lowercase, dot-separated domain paths ending in a past-tense action. For a
resource inside a module, the canonical form is `<module>.<resource>.<action>`, for example
`chat.message.created`. Never collapse the resource and action into a camelCase segment such
as `chat.messageCreated`. A top-level aggregate whose resource is already the module name may
omit the duplicated resource (`user.created`, not `user.user.created`). Producers, `EventMap`
keys, and subscriber groups must use the exact same key.
## When to use an event (vs a queue, vs a direct call)

- **Direct method call** — when the caller needs the result or the work must be part of the
  same request/transaction. (e.g. a controller calling its service.)
- **Event** — when "X happened" and one or more modules want to react, and the caller does
  **not** care about the outcome. In-process, immediate-ish (deferred to a microtask), not
  durable. The bus tracks in-flight handlers so tests can await them (`eventBus.settled()`);
  production code never waits on it.
- **Queue** — when the reaction is slow, external, or must survive/retry (email, third-party
  calls). See queues.md. A common shape is: event handler is thin and just **enqueues**.

## Anatomy

Three pieces, all built on the decorator→metadata pattern (architecture.md).

**1. The payload type** — in `contracts/domain/`:

```ts
// src/modules/user/contracts/domain/events.ts
export interface UserCreatedPayload{ userId: number; }
```

**2. Register the key in the global `EventMap`** — in `contracts/types/*.d.ts`. This is how
`emit` becomes type-safe **without** `shared/` importing your module (rule 5):

```ts
// src/modules/user/contracts/types/events.d.ts
import type { UserCreatedPayload } from '../domain/events';

declare global{
    interface EventMap{
        'user.created': UserCreatedPayload;
    }
}
```

Each module adds its own `'group.event' → Payload` line via `declare global`. The bus's
`emit<K extends keyof EventMap>(event: K, payload: EventMap[K])` reads this merged interface,
so a wrong key or wrong payload is a **compile error**.

**3. The event group** — a default-exported class in `events/`, discovered at boot:

```ts
// src/modules/user/events/UserEvents.ts
import { DefineEventGroup, Event } from '@/shared/events/EventGroup';
import UserSettingsService from '../services/UserSettingsService';
import type { UserCreatedPayload } from '../contracts/domain/events';

@DefineEventGroup('user')
export default class UserEvents{
    #settings = new UserSettingsService();

    @Event('created')
    async created(payload: UserCreatedPayload){
        await this.#settings.provision(payload.userId);
    }
}
```

`@DefineEventGroup('user')` + `@Event('created')` means the method subscribes to the key
`user.created`. At boot, `registerEventGroup` instantiates the class once, binds each `@Event`
method to that instance, and subscribes it. A group class with no `@DefineEventGroup` throws
`RuntimeError(EventError.UndefinedGroup, 500)`.

## Emitting

Anywhere, after importing the singleton:

```ts
import { eventBus } from '@/shared/events/EventBus';

// inside AuthService.signUp, after the user is saved:
eventBus.emit('user.created', { userId: user.id });
eventBus.emit('notification.send', { to: user.email, subject: 'Welcome to Pollium', html: `<p>Welcome, ${user.username}.</p>` });
```

`emit` returns `void` immediately. Handlers run deferred (`Promise.resolve().then(...)`), and
each is individually wrapped in `.catch` that logs `EventBus::HandlerFailed:<event>`. So:

- The caller (`signUp`) returns its result regardless of what handlers do.
- One handler throwing does not stop other handlers or crash the process.
- **Delivery is best-effort and not transactional.** A handler failure is logged, not retried.
  If the reaction must not be lost, the handler should enqueue to a durable queue (queues.md),
  which is exactly what `notification.send` does.

## Real linkage in this codebase

`AuthService.signUp` emits two events:
- `user.created` → `UserEvents.created` → `UserSettingsService.provision(userId)` (lazily
  creates the settings row).
- `notification.send` → `NotificationEvents.send` → `SMTPQueue.add(payload)` → BullMQ →
  `MailService.send` (the welcome email).

This is the intended cross-module style: `auth` doesn't call `user` or `notification`
directly; it announces `user.created` / `notification.send` and they react.

## Checklist for a new event

1. Payload interface in `contracts/domain/`.
2. `'group.event' → Payload` line in a `contracts/types/*.d.ts` via `declare global { interface EventMap {...} }`.
3. A `@DefineEventGroup('group')` class in `events/` with an `@Event('event')` handler (auto-discovered).
4. `eventBus.emit('group.event', payload)` at the emit site (now type-checked).

## Anti-patterns

- **Don't `import` a module's payload type into `shared/`** to type an emit — augment the
  global `EventMap` instead (rule 5).
- **Don't rely on an event for critical/transactional work** — handlers are best-effort and
  errors are swallowed. Use a direct call, or enqueue for durability.
- **Don't do slow work directly in a handler** — enqueue it (queues.md); keep handlers thin.
