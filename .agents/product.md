# Product

Pollium is an **AI-native education platform**: you ask to learn anything, and the AI
generates a course, teaches it, and reshapes it around how *you* learn. The same engine
serves a school classroom, a university cohort, and a lone self-taught learner. This
document is the north star — the *why* and the *what*. The engineering spokes
([architecture.md](architecture.md), [conventions.md](conventions.md), …) are the *how*.

> **How to read this doc.** It describes the **target product** and marks what exists
> **today** with a status tag: ✅ built · 🟡 partial · ⬜ not started. A feature described
> here does **not** imply it exists — check the tag, and when in doubt grep the code. A
> product doc without a reality marker is marketing, not context; keep every claim tagged.
> The canonical entity-level status lives in `domain-model.md` (planned); this doc stays at
> the level of intent and scope.

## The wedge — why this can win

Do **not** frame Pollium as "more courses than Udemy" or "cheaper than Platzi." Catalog
platforms sell a *finite, static* library of recorded video. NotebookLM answers questions
over documents but has no curriculum, no progression, no pedagogy. Pollium's edge is a
different shape:

1. **On-demand generation.** The course does not exist until you ask for it. The catalog is
   effectively infinite because it is generated, not curated.
2. **Real-time adaptation.** A roadmap is an ordered path from fundamentals to mastery. When
   the learner struggles, the AI *knows* (it has the signal) and reinforces the weak skill —
   inserting or reordering steps. The promise "it's hard to not learn" is a **mechanism**
   (adaptive roadmap + skill signal), not a slogan — and that mechanism is what we build.

Everything else (gamification, 3D tutor, social) is retention and differentiation layered on
top of that loop. It is not the wedge, and it is not what we build first.

**Where point 2 actually stands.** The *first* path is generated: reading
`roadmapRoutes.forEnvironment` for a lesson with no roadmap generates one per student, once
(`RoadmapGenerator` + `RoadmapBuilder`). Two simultaneous first reads are serialised with a
Postgres transaction-scoped advisory lock on `(userId, environmentId)` plus a re-check inside the
transaction — **not** a unique index, because `Roadmap` deliberately allows several rows per
lesson today (`CourseSummaryService` de-duplicates them, and a test pins that). The lock is taken
around the write only, never across the model call, so a race costs one wasted completion rather
than a transaction held open on a provider round trip.

**Adaptation is not built.** Inserting or reordering steps when a learner struggles needs a skill
signal that does not exist yet — `RoadmapStep.done` and the mastery evidence behind it are the
closest thing, and the domain events are all gamification and notifications. A generated static path is already the
difference between a course with a path and a course with a list of lessons, but do not describe
the adaptive half as shipped until telemetry and a skill model land.

## The core generalization: Org → Workspace → Environment

The single best design decision in Pollium is that one hierarchy serves every audience:

| Product concept | Code name | Meaning |
|---|---|---|
| Tenant / school / "my account" | `Organization` | The top-level container. Every user has a **default org**. ✅ entity / ⬜ default-on-signup |
| Course | `Workspace` | A subject or course inside an org. ✅ |
| Lesson / unit | `WorkspaceEnvironment` | An ordered section within a course (`position`). ✅ |
| Learning material | `WorkspaceFile` | An uploaded asset attached to a lesson. ✅ |
| Lesson body | `LessonContent` | The generated body of a lesson, one row per `WorkspaceEnvironment`. ✅ |

Because the model is generic, a *school* is an org with many members and teacher/admin roles;
a *self-taught learner* is an org of one; a *university* is an org with cohorts. We never
branch the schema per audience — we express the audience through membership, roles, and
configuration. **When adding a feature, prefer expressing it on this hierarchy over inventing
a parallel one.**

**Where a generated lesson body lives — decided: its own entity, Markdown, generated lazily.**
`WorkspaceEnvironment` deliberately has no `content` column: `listByWorkspace` returns whole
entities, so putting a 20 KB body on the row would make every Courses and lesson list pay for text
it does not render. `LessonContent` is keyed unique on `environmentId` and carries
`status` (`pending | ready | failed`), the `body` and the `model` that produced it. It is
**shared org content, not per-student state** — it hangs off the environment, never off
`(userId, …)`, so two students in one course read the same lesson (the opposite of `Roadmap`).
The body is **Markdown**: the web has no lesson view yet, so a structured content contract would
be guessed before a renderer or a practice-item generator exists to consume it; the entity makes a later
`format` column or a second structured column additive rather than a migration of every lesson.
Generation is **inline on first read** and claimed by inserting the `pending` row, so two
simultaneous first opens produce one generation (the loser's insert hits the unique index and
re-reads); a provider failure lands in `failed` with an empty body and the next open retries. The
status is what makes a later move to `BaseQueue` an implementation change rather than a contract
change.

## The load-bearing data rules

Two rules govern the whole data model. Violating either breaks the product thesis.

**1. Shared by org, private by student.** Workspaces and environments (the *content*) are
shared across an org's members — one course, many learners. But **chats, progress, roadmaps,
and every learning signal are per-student.** Two students in the same course see the same
lessons and completely separate progress and tutoring history. Any new entity must answer:
*is this shared content, or is this per-student state?* Content hangs off the org/workspace;
state hangs off `(userId, …)`. (Today `Note` is the only entity that models this correctly:
shared org/workspace association, per-user ownership. ✅)

**2. The data is the moat — so capture it from day one.** The stated core value is the
KPI/metric data captured on learners: what they mastered, where they struggled, how they
learn. This is a genuine moat **only if the data exists**, and learning signals not captured
at the moment they happen are lost forever. It is therefore possible to build every feature
and still have *no moat*, because the instrumentation was never wired. Learning telemetry is
not a phase-2 nicety — it is the spine that must go in alongside the very first tutoring
interaction, on the event bus we already have ([events.md](events.md)). See `telemetry.md`
(planned) for the event catalog.

## The central loop (what the product minimally *is*)

Strip away everything shiny and this is the loop that validates the entire thesis. Building
it end to end is the current priority:

```
1. Learner asks to learn X
2. AI generates a Roadmap — ordered steps, fundamentals → mastery          ⬜
3. A per-student tutoring chat walks the steps, using the org's AI key      ⬜
     → this is the first path that DECRYPTS the provider key and CALLS an LLM
4. Every interaction emits learning-telemetry events                        ⬜
5. Progress + skill signals are recorded per student                        ⬜
6. On a weakness signal, steps are inserted / reordered — adaptation        ⬜
```

As of now this loop produces **zero** of its steps: there is no `Roadmap` entity, no
`ChatSession`, no progress/skill model, `SecretCipher.decrypt` is never called, and nothing
ever writes a `TokenUsage` row (so usage metrics are always zero). The foundation beneath the
loop — auth, orgs, workspaces, provider config, storage, email — is built (see phasing). The
loop itself is the work.

## Scope & phasing

The scope is deliberately staged. The danger is that Pollium *sounds* like five startups in
one (an LMS, a multi-tenant SaaS, an AI tutor, a gamified social network, a real-time 3D/voice
product, and a research-agent platform). Trying to build them in parallel is the project's
top risk. The shiny features are deferred **on purpose** — they only matter once the loop
works and has users.

| Phase | Scope | Status |
|---|---|---|
| **0 — Foundation** | Auth (email+password), orgs + membership/roles, workspace/environment/file CRUD, user profile/settings/friendship/avatar, AI provider config (encrypted key) + usage table, transactional email. | ✅ mostly built |
| **1 — The central loop** *(build now)* | Default org on signup; roadmap generation; the AI inference path (decrypt key → call provider → write `TokenUsage`); per-student tutoring `ChatSession`; learning-telemetry events; progress + skill model; adaptive step insertion. | ⬜ |
| **2 — Retention & differentiation** *(next)* | Leagues/leaderboards (global + per-org, configurable tiers/cadences), achievements/streaks/daily goals, in-app notifications, public profiles & social surfaces. | ⬜ |
| **3 — Moonshots** *(explicitly deferred)* | 3D whiteboard classroom + real-time voice orb tutor + generated 3D/interactive pieces; "Pollium Science" research-agent orchestration; OAuth / social login / link-your-ChatGPT. | ⬜ |

**Do NOT start phase-2 or phase-3 work before the phase-1 loop runs end to end.** The 3D/voice
orb is the most visible feature and the most tempting to start — it is also the highest cost,
highest latency, hardest to get right, and least validated. It is a phase-3 moonshot, not a
first deliverable.

## Open product decisions (unresolved — flag before assuming)

- **Solo-learner onboarding vs. BYO key — decided: gated, BYO only.** The AI provider key is
  configured *per org by an admin*, and a solo learner in their own default org **is** that admin.
  The platform ships no fallback key and absorbs no inference cost: the tutor is unavailable until
  the org has an active provider. To keep that state legible instead of an error code, the client
  asks `aiRoutes.tutorAvailability` (`GET /ai/organizations/:orgId/tutor`) — readable by any
  member, answering `{ isAvailable, blocker }` and nothing about the provider itself — and Home
  says what is missing, linking an admin to `/settings/providers`. A platform fallback provider
  remains possible later, but it is a business decision about absorbing inference cost and must
  arrive with a per-user cap enforced *before* the call; it is not part of the chat feature.
- **"Link your ChatGPT → Codex" carries ToS risk.** Driving inference through a user's linked
  ChatGPT account to reach Codex may violate provider terms and can break without notice. The
  provider-agnostic BYO-key model (already built) is the safer primary path; treat the
  ChatGPT-link as a phase-3 experiment, not a dependency.
- **BYO providers that cannot call tools — decided: an explicit capability flag.** `baseUrl` is
  BYO, so an org can point at a local llama.cpp or a thin proxy that does not implement tool
  calling, and that failure is usually *silent* — the model narrates the call in prose instead of
  emitting one. "Try it and degrade on error" therefore cannot detect the common case, so
  `AIProvider.supportsTools` (default `true`) declares it instead: `ModelResolver` carries the flag
  and `AICompletionService` withholds the tool set when it is false, degrading deterministically to
  a text-only tutor. The tool loop is separately capped by `generation.maxToolSteps`
  in the platform limits (`AICompletionService.#steps` → `stopWhen: stepCountIs(n)`), keyed per
  `UsagePurpose` like the output ceiling and tunable from the admin console. That cap is the only
  bound on a tool loop: `TokenUsage` records spend but nothing enforces it.

- **Role model is thin.** Only `Admin`/`Member` exist. The education framing implies
  teacher/instructor vs. student, and schools will expect teacher-facing metrics. Decide the
  role taxonomy before leaderboards/metrics are built on top of it.
  - **Decided — who may author a course: any member, and the UI matches.** `/courses` shows the
    create control to every member of the current organization; it is *not* wrapped in
    `RequireOrgAdmin` and there is no `org-admin` route for it. This mirrors the server, which is
    the only enforcement point: `WorkspaceService.create` calls `assertMember`, not an admin
    check. An admin-only button would therefore hide a control the api still honours for members
    — hiding UI is not authorization — while leaving a member with no way out of an empty course
    list. "A student should not publish courses to the whole org" is a real concern, but its fix
    is the teacher/student taxonomy above; expressing it now as a client-side admin gate would
    pre-commit that taxonomy in the wrong layer. When the taxonomy lands, move the rule into the
    api guard and let the UI keep mirroring it.

## Related spokes

- [architecture.md](architecture.md) — how the app boots and a request flows.
- [domain-model.md](domain-model.md) *(planned)* — canonical entities/relations with per-entity status.
- [telemetry.md](telemetry.md) *(planned)* — the learning-event catalog that feeds the moat.
- [conventions.md](conventions.md) — coding rules; note rule 9 (English everywhere) applies here too.
