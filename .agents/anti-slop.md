# Anti-slop rules

Portable rules for any project using **C++, TypeScript/JavaScript, HTML/CSS, React**. Copy this
file into a new repo and point the agent at it (see *Wiring* at the bottom).

The problem it targets is not code that fails. It is code that **works and cannot be maintained**:
correct, superficially tidy, architecturally incoherent, and unreadable by the next human. That
failure mode has a measurable signature — across 623M analysed changes, duplicated blocks rose 81%
since 2023 while refactoring fell 70%, leaving developers roughly **five times likelier to
duplicate than to reuse**; error-masking constructs rose 47%. Nothing here is about taste. Every
rule below exists because a specific, reported, repeated failure produces unmaintainable code.

**How to read this.** Part 0 is the contract — internalise it and apply it to every change.
Parts 1–5 are lookup tables for the language you are touching; consult the relevant one before
writing, not after. Part 6 is a mandatory pass over your own diff before you hand it over.

> Agents stop following rule files reliably past roughly 200 lines or 15 directives. Part 0 is
> deliberately 16 rules and nothing more. If you add to this file, add to the appendices — do not
> grow Part 0.

---

## Part 0 — The contract

### 1. Search before you write. Never create a second version of something.

Before writing any helper, type, constant, hook, component or utility, search for it. This is the
single highest-value rule in the file: duplication is the dominant measured symptom of AI-assisted
codebases, and it is the one an agent is structurally predisposed to cause, because each prompt
looks like a fresh canvas.

```
rg -n "formatDate|formatDuration" --type ts
rg -n "^(export )?(const|function|class) <Name>"
```

Two `formatDate` implementations that disagree about `26/5` vs `26/05` is not a style problem. It
is a bug that gets fixed in one copy. If something close exists, **extend it or call it**. If it
genuinely does not fit, say so in your summary and explain why a second one is correct.

Corollary: a duplicated block carries a propagation tax — every future change to it obligates
someone to find and assess every sibling copy. You are not saving time, you are billing it forward.

### 2. The surrounding code is the style guide, and it outranks this file.

Read the neighbouring files before writing. Match their naming, their error handling, their
imports, their layering, their formatting. Stylistic inconsistency is a named slop category, and
its cost is real: a codebase with contradictory patterns cannot be reasoned about as one system.

Never introduce a second way of doing something the codebase already does one way — a second HTTP
client, a second date library, a second state pattern, a second error shape. If the existing way is
genuinely wrong, say so and stop; do not both flag it and quietly add the alternative.

### 3. Zero comments. Not even a "why" one — that reasoning goes in a name, a test, or a commit.

Comments are the most reliable fingerprint of machine-written code, and the most reliable reason a
human distrusts a file on sight. A reason that is not recoverable from the code is a sign the code
needs a better name or a different shape, not a note taped to the side of it.

Bad:

```ts
// Loop through the users and hash each password
for(const user of users){
    user.passwordHash = await hash(user.password);
}
```

Also bad — the "why" exception some rule sets carve out, and this one does not:

```ts
// retry 3x: upstream API drops ~1% of requests under load, see INFRA-482
for(let attempt = 0; attempt < MAX_UPSTREAM_RETRIES; attempt++){ ... }
```

Good — no comment at all. `MAX_UPSTREAM_RETRIES` and a test asserting the third attempt gives up
carry what the comment was trying to.

The only comments that earn their place are machine-read, not prose written for a human: schema
tags a validator consumes (`/** @format email */`), pragmas, and `eslint-disable` with a stated
reason — deleting one of these changes behaviour, deleting a prose comment never does. Never
narrate steps, never write a docstring for a self-evident helper, never add section banners, never
put emoji in code or comments.

### 4. Build the smallest thing that satisfies the request.

Over-engineering is a named slop category and an independently reported complaint: models introduce
extraneous modules, helper classes, indirection layers and convoluted solutions for trivial
problems. Over-abstracted code is harder to debug than the duplication it was meant to prevent.

Banned unless the request requires it:

- an interface, base class or generic with exactly one implementation
- a config option, flag or parameter with exactly one caller passing one value
- a factory, registry, wrapper, adapter or manager introduced pre-emptively
- an event/callback indirection where a direct call would do
- a plugin point for a second case that does not exist
- retry, cache, pooling or batching that nobody asked for

Three concrete uses justify an abstraction. Two do not. Write the direct version; the extraction is
cheap later and the deletion of a wrong abstraction is not.

### 5. Validate once, at the boundary. No defensive noise inside.

Unnecessary defensive programming — extra `try`/`catch`, null checks and re-validation in code
paths whose inputs were already checked upstream — is a named slop category. It doubles the volume
of a function, hides the actual logic, and makes every reader wonder what case you knew about that
they do not.

Bad:

```ts
const total = (items: Item[]): number => {
    if(!items) return 0;
    if(!Array.isArray(items)) return 0;
    if(items.length === 0) return 0;

    return items.reduce((sum, item) => sum + (item?.price ?? 0), 0);
};
```

Good:

```ts
const total = (items: Item[]): number => {
    return items.reduce((sum, item) => sum + item.price, 0);
};
```

The type says `Item[]`. Trust it. Put the validation where untrusted data enters the system — the
HTTP edge, the file parse, the message deserializer — once, and let everything behind it work with
trusted values.

### 6. Never silence a type checker, a linter or a compiler warning.

Type-system workarounds are a named slop category, and error-masking constructs are a measured,
rising signal. A suppression converts a compile-time failure into a runtime one, which is the exact
opposite of the trade you want.

Banned: `any`, `as unknown as T`, `@ts-ignore`, `!` non-null assertion, `eslint-disable` without a
stated reason, `// NOLINT`, `#pragma warning(disable)`, casting away `const`, `catch(e: any)`.

If the types do not fit, the types are wrong or your design is wrong. Fix that. `@ts-expect-error`
with a one-line reason is acceptable **only** to assert that something must not compile (in a test).

### 7. Failures surface. Never paper over one.

Reported band-aids, verbatim: `setTimeout` to dodge a race, deleting a method instead of repairing
it, and fixes delivered with unwarranted confidence in a "death loop".

Banned:

- an empty `catch`, or one that only logs and continues
- a fallback value that makes a failed operation look successful
- `setTimeout`/`sleep` to work around an ordering or race problem — fix the ordering
- swallowing an error to make a test or a screen go green
- broad `catch(...)` around a block whose failure modes you have not enumerated

If you cannot handle an error meaningfully at that layer, let it propagate. An error that reaches a
boundary and gets reported is a working system; one that gets absorbed is a system that lies.

### 8. Never modify a test to make code pass. Never mock away the thing under test.

The worst reported real-world case: a middleware change that aborted early and bypassed most
authorization, shipped green because the authorization tests were mocked out.

If a test fails, the code is wrong until proven otherwise. Changing an assertion, loosening a
matcher, adding a mock, or skipping a case to get green is falsification. If a test is genuinely
wrong, say so explicitly and separately — never inside the change it would unblock.

### 9. A test must be able to fail.

The same model writing code and tests turns a bug into the expected value. Assert-nothing and
tautological tests both score 100% line coverage, which is why coverage cannot detect them.

Every test must state a behaviour that could break. Before finishing one, ask: *if I inverted the
condition in the code under test, would this fail?* If not, delete or rewrite it.

Banned: asserting only `toBeDefined`, `not null`, `length > 0`; asserting that a mock returned what
the mock was configured to return; re-implementing the logic in the test and comparing to itself;
snapshotting output nobody will read.

### 10. Keep control flow flat and functions short.

Quantified, because "keep it readable" is unactionable:

- function ≤ 40 lines; if you cannot describe it in one sentence without "and", split it there
- nesting ≤ 3 levels
- parameters ≤ 4 — past that, pass one named object
- file ≤ 400 lines

Guard clauses, not nested conditionals; early return for the exceptional case, then the real work
at the unindented baseline. Never let a ternary be the shape of a whole function — a `?:` spanning
the body reads as one expression and hides that there are two outcomes.

### 11. Name at the right altitude. No magic values.

Reported naming tells: names that are too generic (`data2`, `result_final`, `processItem`) and names
that are artificially verbose (`getUserDataFromDatabaseHelperFunction`). Both are unreadable; pick
the word a domain expert would use.

Unexplained magic numbers are a hallmark of generated code — models pick values that are
syntactically plausible and contextually meaningless. Every literal that is not `0`, `1` or `''`
gets a named constant at module scope, or it does not appear.

### 12. Change code in place. Never leave the old path behind.

Do not add a `v2`, a `New` suffix, a parallel branch behind a flag nobody asked for, or a
compatibility shim for a caller that does not exist. Do not comment out the previous
implementation — the version control system already keeps it.

When you change a signature, update every call site. Search for them; do not assume.

### 13. Touch only what the task requires.

No drive-by refactors, no reformatting untouched lines, no dependency bumps, no renaming things you
happen to dislike, no reordering imports across a file you edited two lines of. A diff whose real
change is buried in 400 lines of noise cannot be reviewed, and unreviewable is the same as unsafe.

If you spot something genuinely wrong outside your scope, finish the task, then report it
separately.

### 14. New concerns go in new files. Never pile onto the file you happen to be editing.

A reported structural failure: appending everything to the currently-open file until it becomes a
2,000-line module conflating unrelated concerns. Before adding code, ask where it belongs in the
existing layout, and put it there — even if that means creating a file for twelve lines.

### 15. State the plan before a non-trivial change, and read before you write.

For anything beyond a localised edit, first restate the problem, the intended outcome, and the
files you will touch. This catches the silent-wrong-assumption failure mode before it becomes a
diff.

Never modify a function's signature, a shared type or a config value without reading its call
sites first.

### 16. Stop after three failed attempts and surface the impasse.

Without a budget, a failing check becomes retry-until-context-exhaustion, and each iteration adds
scar tissue: a cast here, a suppression there, a mock somewhere else. After three genuine attempts,
stop, revert the speculative changes, and report what you tried, what you observed and what you
believe is actually wrong.

---

## Part 1 — TypeScript / JavaScript

**Types are the design, not decoration.** `any` is the most frequent single offender in generated
TypeScript, and models default to it when they lack context. When you do not know a type, use
`unknown` and narrow with a type guard.

```ts
try{
    await save(values);
}catch(cause: unknown){
    setError(toError(cause));
}
```

**Model variants as discriminated unions, not one type with many optional fields.** This is the
pattern generated code underuses most, because training data is full of optional-field bags. A
literal tag makes the compiler narrow each branch with no casts, and makes adding a variant flag
every site that must change.

```ts
type Result =
    | { kind: 'ok'; value: User }
    | { kind: 'notFound' }
    | { kind: 'failed'; cause: Error };
```

Pair it with an exhaustiveness check so a new variant breaks the build:

```ts
const assertNever = (value: never): never => {
    throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
};
```

**No inline object types in signatures.** A parameter type is a contract; name it and put it where
contracts live. `where: { orgId: number; userId?: number }` is unreusable and reads as structure
instead of intent. Inline unions of primitives (`'asc' | 'desc'`) are fine.

**No optional parameters or fields you do not need.** Every `?` is a branch someone must handle.
Prefer a required field with an explicit `null` when absence is meaningful.

**`async`/`await` with `try`/`catch`/`finally`. Never `.then(onOk, onErr)`.** The two-callback form
puts the failure path above the success path and makes `finally` a fourth indentation level.

**Every promise is awaited or explicitly voided.** An un-awaited promise in an event handler makes
loading state flicker and sends rejections nowhere.

```ts
onClick={() => { void handleClick(); }}
```

**`fetch` needs three things generated code omits.** It only rejects on network failure, so a 500
resolves happily and `res.json()` parses an error page:

```ts
const load = async (id: number, signal?: AbortSignal): Promise<User> => {
    const response = await fetch(`/users/${id}`, { signal });

    if(!response.ok){
        throw new HttpError(response.status);
    }

    return response.json() as Promise<User>;
};
```

Check `ok`, accept an `AbortSignal`, and give the parsed body a type. Do this once in a shared
client, not per call site.

**Object parameters over long positional lists.** `sendEmail(email, subject, template, true, false)`
is unreadable at the call site. Same for returns: a tuple past two elements becomes a named object.

**Prefer `const`, and prefer immutable updates.** Reassignment forces the reader to scan downward
before reasoning about a value.

**No barrel-file sprawl.** Do not add an `index.ts` that re-exports a directory just to shorten an
import; it hides the dependency graph and defeats tree-shaking. Import by path.

---

## Part 2 — React

**`useEffect` synchronises with a system outside React. Nothing else.** Models have a strong
predisposition toward effects because tutorials do. If no external system is involved, you do not
need an effect.

Banned, with the correct form:

| Generated pattern | Why it is wrong | Correct form |
|---|---|---|
| `useState` + `useEffect` to derive a value from props/state | Renders twice; the first render shows a stale value, and the two can desynchronise | Compute it during render |
| `useEffect` to fetch server data | No abort, no error branch, no dedup, and Strict Mode fires it twice | A query library (TanStack Query, RTK Query, SWR) |
| `useEffect` copying props into state | A prop change silently overwrites the user's edits | Keep state for edits only; combine during render |
| `useEffect` reacting to a state change caused by a click | The reason is invisible at the call site | Do the work in the event handler |
| Effect chains — one effect setting state that triggers the next | A cascade of renders, impossible to follow | One handler, or derive |
| `useEffect(() => { init(); }, [])` for work that needs no component | Runs on every mount for no reason | Module scope, or the query layer |
| `useState` mirroring a prop | Two sources of truth | Read the prop |

**Never disable `react-hooks/exhaustive-deps`, and never call a hook conditionally.** Both are
common in generated code and both are wrong every time. A missing dep gives you a stale closure —
the classic interval that reads `count` as `0` forever. Use a functional setter to drop the
dependency honestly:

```ts
useEffect(() => {
    const id = setInterval(() => setCount((current) => current + step), 1000);

    return () => clearInterval(id);
}, [step]);
```

Conditional hooks break React's positional hook list and crash on the render where the condition
flips. Call the hook unconditionally; put the condition inside, or return early *below* every hook.

**Always clean up.** Every subscription, interval, listener and in-flight request gets torn down in
the effect's return. Missing cleanup is a reported staple of generated async code.

**Keys are identity, never position.** `key={index}` on a reorderable or filterable list makes
React reuse the wrong DOM node and the wrong state. Use a stable id.

**Do not add `memo`/`useMemo`/`useCallback` speculatively.** Generated code adds `memo` to the
child while the parent still passes a fresh arrow function on every render, so nothing is memoised
and the comparison cost is pure overhead. Fix the parent, or leave it alone. Optimise when you have
measured.

**Server state does not live in `useState`.** One read path for the whole app: a query hook. No
component fetches with `useEffect` + `setState`.

**Optimistic UI needs rollback, or it must not exist.** Fire-and-forget leaves a phantom row that
survives until reload and reads as data loss. Snapshot, write, restore on error, invalidate on
settle — or just show the pending state and wait.

**One component per file, and the file is named for it.** The moment a piece of markup earns a
name — a row, a nav item, an icon — it becomes its own file. A private second component beside its
parent is how a 600-line `.tsx` starts.

**Branch after the hooks, never before.** Loading and missing states return first, so the happy
path gets the unindented baseline.

**Never disable Strict Mode to stop double-invocation.** The double render is telling you an effect
is not idempotent. That is a bug report, not a nuisance.

---

## Part 3 — HTML / CSS

Generated UI is inaccessible by default: the model optimises for pixels and has no representation
of the accessibility tree, so left unconstrained it converges on div soup. Same pixels — one is a
door, the other is a painting of a door.

**Use the element that means the thing.**

- `<button type='button'>` for actions. Never a clickable `<div>` or `<span>`.
- `<a href>` for navigation. Never a `div` with `onClick` and `cursor-pointer`.
- Landmarks: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`. A page with no `<main>` has no
  skip-navigation; a page with no `<nav>` cannot be navigated by screen reader.
- `<h1>`–`<h6>` in order, no skipped levels.
- `<ul>`/`<ol>` + `<li>` for lists; `<table>`/`<thead>`/`<tbody>`/`<th>`/`<td>` for tabular data.
- `<form>`, `<fieldset>`, `<legend>`, `<label>` for forms.
- `<dialog>` with `showModal()`, `<details>`/`<summary>` for disclosure.

**Every interactive element has an accessible name; every input has a label.** Icon-only button:
`aria-label` on the `<button>`, `aria-hidden='true'` on the `<svg>`. Decorative image: `alt=''`.

**Never hand-roll a composite widget.** A custom select done properly is ~150 lines of keyboard
handling that generated code never includes. Use a headless primitive library (Radix, React Aria,
Headless UI) and let it own semantics while you own styling. Decoupling the semantic layer from the
visual layer is the highest-leverage architectural decision here.

**Keyboard and focus.** Everything interactive is reachable by keyboard. Never remove an outline
without replacing it — use `:focus-visible`. Modals trap focus, restore it on close, and close on
Escape.

**State goes in ARIA, not only in CSS.** `aria-expanded`, `aria-selected`, `aria-current`,
`aria-checked`, `aria-disabled`. `aria-live='polite'` for status messages, `aria-describedby` for
help and error text.

**Honour `prefers-reduced-motion`** for spatial movement — transforms, position, scale. Colour
transitions need no guard.

**Contrast is the most common WCAG failure**, and generated code misses it specifically on
placeholder text, disabled states and text on coloured backgrounds. Check it.

**CSS hygiene.**

- No `!important`. It is a suppression (rule 6) with a different syntax.
- No z-index arms race. Named layers/tokens, not `z-index: 9999`.
- No magic pixel values. Spacing, radius, colour and type come from the token scale.
- Repeated utility strings are a missing component, not a copy-paste. Once the same 14 classes
  appear a third time, it becomes one component — otherwise structure disappears into near-duplicate
  utility soup tweaked per breakpoint.
- Do not restyle a library primitive by overriding its internals; use the API it exposes.

---

## Part 4 — C++

C++ is where generated code is least trustworthy: a snippet's correctness depends on the standard
version, compiler flags, platform and whether exceptions are enabled — all of which the model
otherwise guesses. State the standard and the flags before asking for code, and never accept "it
compiles" as evidence of anything.

**Ownership is explicit in the type. Owning raw pointers are banned.**

| Intent | Parameter / member |
|---|---|
| takes ownership | `std::unique_ptr<T>` by value |
| shares ownership (genuinely shared lifetime) | `std::shared_ptr<T>` by value |
| observes, required | `const T&` / `T&` |
| observes, optional | `const T*` |
| borrows a contiguous range | `std::span<const T>` / `std::string_view` |

`std::make_unique` / `std::make_shared`, never `new`. No `delete`. No `malloc`.

**Do not over-correct.** A `shared_ptr` where a reference or a non-owning raw pointer would do is
also a defect — it buys atomic refcounting and an ownership question nobody can answer. `shared_ptr`
requires a real shared-lifetime story; write it down or use `unique_ptr`.

**RAII, and prefer the rule of zero.** If a class needs a custom destructor, it almost certainly
needs all five special members — a custom destructor with defaulted copy is a double-free waiting
for the first copy. Better: own nothing directly and let members handle it.

Bad:

```cpp
class Session{
public:
    Session() : buffer_(new char[4096]){}
    ~Session(){ delete[] buffer_; }

private:
    char* buffer_;
};
```

Good:

```cpp
class Session{
private:
    std::vector<char> buffer_{std::vector<char>(4096)};
};
```

**Const-correctness, and beware the silent copy.** `auto` copies. In a range-for over anything
non-trivial, `for(const auto& entry : entries)` — `for(auto entry : entries)` is a per-iteration
copy that no warning reports. Mark member functions `const` when they do not mutate; take
parameters by `const&` unless you are sinking them.

**Exception safety is a decision, not an accident.** For each function, know which guarantee you
provide — no-leak (basic), rollback (strong), or `noexcept`. Ask what happens if a constructor in
the middle of your initialisation sequence throws. Mark move operations and destructors `noexcept`
where they are.

**Header hygiene.** Include what you use — the compiler accepting a transitive include is not
evidence. No `using namespace` at file scope in a header. Forward-declare in headers where you can;
include in the `.cpp`. `#pragma once` at the top.

**Verify every API you did not write.** Hallucinated standard-library and third-party symbols are
the characteristic C++ failure — a plausible-looking overload that does not exist, or exists with
different semantics. Look it up. If `clang-include-fixer` cannot resolve a symbol to a header, the
symbol probably does not exist.

**Prefer the algorithm, but not at the cost of legibility.** `std::ranges` over a hand-rolled loop
where it reads better; a plain loop where the algorithm version needs three lambdas and a
projection.

**Do not reach for templates, `constexpr` or metaprogramming to solve a problem that has no second
type.** Rule 4 applies with extra force here, because the error messages are the worst in the
industry.

**Undefined behaviour is not a style question.** No signed overflow, no dangling `string_view` into
a temporary, no reading a moved-from object, no `reinterpret_cast` for type punning, no
out-of-bounds `operator[]` where the index is not proven.

---

## Part 5 — Gates

Do not report work as done until these pass. "It compiles" and "the tests are green" are the two
weakest signals available, because generated code is optimised to produce both.

**Every language**

- Formatter and linter clean, with zero new suppressions.
- Full test suite green — and a new test that fails before your change, if you fixed a bug.
- A duplication check (`jscpd`, `clang-tidy` clone detection) does not report a new clone.

**TypeScript / React**

```
tsc --noEmit        (strict; no new any, no new suppressions)
eslint .            (react-hooks/* and jsx-a11y/* at error, not warn)
```

Plus `axe` or `@axe-core/playwright` on any UI you touched.

**C++**

```
-Wall -Wextra -Wpedantic -Werror
clang-tidy          (bugprone-*, cppcoreguidelines-*, modernize-*, misc-include-cleaner)
-fsanitize=address,undefined     on the test binary
```

**When it matters**

Spot-check test quality with mutation testing (`Stryker` for TS, `mutate++`/PIT-equivalents) on the
critical module. Below ~60% mutation score the suite is decorative, and unlike line coverage the
score cannot be gamed by generating more tests.

---

## Part 6 — The slop pass

Before handing over any change, re-read your own diff line by line, as a reviewer who did not write
it, and delete:

1. Every comment that is not a machine-read annotation (rule 3) — including ones that explain why.
2. Every null check, `try`/`catch` or re-validation on an input already validated upstream.
3. Every cast, `any`, `!` and suppression.
4. Every abstraction, wrapper, option or parameter with exactly one caller.
5. Every helper that duplicates something already in the repo (search again — you added a name
   since you last looked).
6. Every reformatted or reordered line unrelated to the change.
7. Every leftover: dead branch, unused import, unused parameter, commented-out code, debug log,
   `TODO` you have no intention of doing.
8. Every test that cannot fail.

Then state, honestly and specifically: what you changed, what you verified and how, what you did
**not** do, and anything you are unsure about. A reviewer's cost is dominated by uncertainty about
what you actually checked — the review burden is already the leading structural cost of
AI-assisted development, and an accurate summary is the only part of it you control.

Never claim something is tested, verified or working when you did not run it.

---

## House style

Project-specific and easy to swap; keep it identical across a codebase. This is one team's set —
replace wholesale, but do not leave it unstated, or the agent will pick a different answer per file.

- 4-space indentation, no tabs.
- Single quotes, including JSX attributes.
- Semicolons terminate statements.
- No space after control keywords or before the opening brace: `if(cond){`, `}catch(error){`.
- Arrow functions for definitions; `function` only where hoisting or `this` requires it.
- Components and pages are `const` declarations with a default export, one per file.
- One member per line in interface and type bodies; one property per line in object literals that
  carry a shape.
- Braces on any body that does work; bare one-liners only for early returns.
- No `: void` / `: Promise<void>` return annotations except on bodyless declarations.
- Filenames: `PascalCase` for components and classes, `kebab-case` for everything else, never
  `camelCase.ts`.
- English everywhere — identifiers, filenames, error messages, commit messages.
- Conventional commits, subject line only.

---

## Wiring

Keep this file as the single source of truth and make the tool-specific files adapters that point
at it, rather than copying rules into four places that then drift:

```
.agents/anti-slop.md          ← this file, the source of truth
AGENTS.md                     → "Follow .agents/anti-slop.md"   (Codex, Cursor, Gemini CLI, others)
CLAUDE.md                     → "@.agents/anti-slop.md"          (Claude Code)
.github/copilot-instructions.md → "Follow .agents/anti-slop.md"  (Copilot, incl. PR review)
.cursor/rules/anti-slop.mdc   → glob-scoped pointer               (Cursor)
```

Two things make it stick beyond the prose:

- **Machine-enforce whatever you can.** A rule that only exists as text decays. `jsx-a11y` and
  `react-hooks` at `error`, `strict` TypeScript, `-Werror`, `clang-tidy`, a duplication tripwire in
  CI. Prose is for the judgement calls that no linter can make.
- **Treat this file as code.** When you relax a rule, change the rule and the tree in the same
  commit. When a review keeps catching the same thing, that is a missing rule, not a missing
  reviewer.

---

## Sources

Research and reports this is drawn from:

- [GitClear — The Maintainability Gap: 2026 AI Code Quality Research](https://www.gitclear.com/the_ai_code_quality_maintainability_gap) — 623M changes; duplication +81%, refactoring −70%, error-masking +47%, connectivity −35%
- [GitClear — AI Copilot Code Quality: 2025 Data Suggests 4x Growth in Code Clones](https://www.gitclear.com/ai_assistant_code_quality_2025_research)
- [Baltes, Cheong & Treude — "An Endless Stream of AI Slop": The Growing Burden of AI-Assisted Software Development](https://arxiv.org/html/2603.27249v1) — 1,154 posts coded; review friction, quality degradation, the `setTimeout` / cast-to-`any` / test-subversion catalogue
- [Jose Casanova — AI Code Slop Reviewer prompt](https://www.josecasanova.com/prompts/ai-code-slop-reviewer) — the five slop categories
- [The Road to Enterprise — AI-Generated React Code: 9 Patterns That Fail in Production](https://theroadtoenterprise.com/blog/vibe-coding-vs-production-coding-react)
- [Convex — Readable TypeScript code: 14 patterns for humans and AI](https://stack.convex.dev/typescript-code-and-readable-ai)
- [Frontend Masters — AI-Generated UI Is Inaccessible by Default](https://master.dev/blog/ai-generated-ui-is-inaccessible-by-default/)
- [Autonoma — AI-Generated Tests That Pass But Don't Assert Anything](https://getautonoma.com/blog/ai-generated-tests-pass-but-dont-assert)
- [The New Stack — Open source maintainers are drowning in AI-generated pull requests](https://thenewstack.io/ai-generated-code-crisis/)
- [Why C++ Gives LLMs a Headache](https://www.ibrahimsowunmi.com/posts/2025/07/why-c-gives-llms-a-headache/)
- [awesome-skills/code-review-skill — C++ reference](https://github.com/awesome-skills/code-review-skill/blob/main/reference/cpp.md)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines) — R.3, R.10, R.21, R.30, F.7
- [clang-tidy — misc-include-cleaner](https://clang.llvm.org/extra/clang-tidy/checks/misc/include-cleaner.html)
- [LLMs' Reshaping of People, Processes, Products and Society in Software Development](https://arxiv.org/pdf/2503.05012) — early adopters on over-engineering
- [Agent Rule Gen — How to write AI coding rules](https://www.agentrulegen.com/guides/how-to-write-ai-coding-rules) — quantified rules, the ~200-line compliance cliff
- [Ivan Morgillo — Your AI coding rules should not live in Cursor rules](https://www.ivanmorgillo.com/2026/05/29/ai-coding-rules-should-not-live-in-cursor-rules/)
