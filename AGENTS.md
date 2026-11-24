- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit generated client files directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk` composes Client, Core, and Server.
- This repository does not use Changesets. Do not add `.changeset` files; follow the existing release workflow instead.

## 项目形态

- 这是 AI Craft 的二次开发仓库（`vergeal/aicraft`），上游是 `anomalyco/opencode`。产品主线是 **Electron 桌面客户端**（`packages/desktop` + `packages/app`），不是 TUI。
- 默认启动客户端：仓库根目录 `bun run dev:desktop`。只改客户端时不要动 TUI、CLI 交互或上游发布流程。
- 上游 `dev` 只作为同步来源；本地 `dev` 已落后，不要以它为基线。开发基线是 `origin/master`，客户端功能分支从最新 `master` 切出（当前主线分支 `timeline-scroll`）。
- 不向上游提 PR；提交在自己的 fork 上完成。diff 与 rebase 都以 `origin/master` 为准，不要使用 `origin/dev`。

## Live Desktop Diagnostics

- When attaching Playwright to a running desktop app, use `chromium.connectOverCDP(endpoint, { noDefaults: true })`.
- Without `noDefaults`, Playwright applies light-mode media emulation during attachment. An app following the system theme then flashes light until the connection closes. The option also preserves the existing focus and other media preferences.
- Do not emulate a color scheme or reduced-motion preference on the user's live window unless explicitly requested; use an isolated test context for those scenarios.

## 客户端界面

- 所有界面与组件必须遵循 `docs/standard/design/` 的设计规范，它对本项目的优先级高于通用样式习惯。先读 `README.md` 与 `01-principles.md`，按改动面读对应篇目，交付前对照 `checklist.md`。
- 视觉决策（颜色、字号、间距、圆角、阴影、动效、图标、密度、导航）以 `docs/standard/design` 为准；`packages/app/AGENTS.md` 的 Typography / Fonts / Scrolling 是实现层约束，冲突时以设计规范为准，并同步修正那份文件。
- 禁止在组件里写死色值、字号、间距、圆角魔法数；优先使用产品已有的语义变量（`--v2-*`、`--font-*`、`--line-height-*`、`color-mix()` 等）。`docs/standard/design/tokens.css` 里的 `--p-*`、`--c-*`、`--density-*` 是设计侧的命名参考，落到产品代码时映射到已存在的变量，不要凭空引入未定义的 token。新增 token 必须通过 `19-governance.md` 的四问门槛。
- 状态样式由语义属性驱动（`aria-*`、`data-state`），不要用 `.is-active` 这类与可访问状态无关的类名表达状态。
- 用户可见文案一律走 i18n：新增 key 时同时写 `zh.ts` 的简体中文；不得硬编码英文。
- 任何界面改动都要在 Electron 客户端里实际验证（根目录 `bun run dev:desktop`），不要只在 Web 或 TUI 下确认。
- 本项目不开发 TUI：不要新增 TUI 功能、实验或故事，也不要为其录制测试。

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Commits

Use conventional commit messages: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected package or area when helpful, e.g. `app`, `desktop`, `session-ui`, `ui`, `core`, `server`, `sdk`, or `plugin`.

Examples: `fix(app): land a reopened timeline at the end it left`, `docs: update contributing guide`, `chore(sdk): regenerate types`.

Do not add upstream release-note SVGs, `.changeset` files, or beta "What's new" entries; this fork does not publish to the upstream beta.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Validate unknown values once at the boundary that owns them. Pass typed values inward instead of repeating `typeof value === "object"` and property-existence checks. Do not defensively revalidate values already guaranteed by a schema, constructor, or internal type.
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Before adding complexity for a speculative or vanishingly unlikely race or security edge case, explain the concrete failure mode, likelihood, and complexity cost to the user and get their buy-in. Do not silently expand scope for theoretical robustness.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent.js"`) when adding a new config module.
- In Effect generators, bind services to named variables before calling methods. Do not use nested service yields such as `yield* (yield* Foo.Service).bar()`.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed imports like `resolve as pathResolve`.
- Never use type-position `import("...")` references such as `Schema.declare<import("@aicraft/plugin/effect/plugin").Plugin["effect"]>`. Only when two imports genuinely collide on a name and no other option exists, an aliased type import (`import type { Plugin as PluginDefinition } from "..."`) is permitted as a last resort — still strongly preferred not to.
- Never use star imports. Do not use `import * as Foo from "..."` or `import type * as Foo from "..."`.
- If a namespace-style value is needed, import the module's own exported namespace by name, for example `import { Project } from "@aicraft/core/project"`, then reference `Project.ID`.
- Prefer dynamic imports for heavy modules that are only needed in selected code paths, especially in startup-sensitive entrypoints. Destructure dynamic import bindings near the top of the narrowest scope that needs them so they read like normal imports. Avoid inline chains such as `await import("./module").then((mod) => mod.value())` or `(await import("./module")).value()`. Keep branch-specific imports inside the branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireConfig` or `readMetadata`.
- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.
- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try` when parsing untrusted JSON strings.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

### Experimental API

- An experimental endpoint lives at `/api/experimental/<group>/...`, its OpenAPI identifier is `experimental.<group>.<method>`, and it lands in the SDK as `client.experimental.<group>.<method>`. Its description says "Experimental: may change without compatibility guarantees."
- `packages/protocol/test/experimental-identifiers.test.ts` enforces the path and identifier match in both directions; the SDK namespace follows from the path.
- An experimental field or parameter on a stable endpoint goes under an `experimental` key (`experimental.<name>`), the same way config does (`config.experimental.*`).
- New endpoints and new default behaviors start experimental.
- To graduate one, move the route out of `/api/experimental`, drop the `experimental.` prefix, and note it in `CHANGELOG.md`.
- Experimental HTTP routes change without aliases: rename or remove the route, then update the callers.
- A breaking move of shipped SDK or plugin API (including moving it under `experimental`) keeps the old path and type names as deprecated aliases of the new ones until the next minor, each marked `@deprecated` with the replacement and "Removed in the next minor". Generated SDK moves get them from the codegen (`compile(..., { aliases: true })` in `packages/client/script/generate.ts`), not by hand.
- Experimental plugin hooks are named `experimental.*` (`experimental.ws.handshake`).

## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package directories such as `packages/core`.
- 不要跑全量测试：改了什么就测什么，从包目录跑单个文件（例如 `packages/core` 下 `bun test test/session-runner.test.ts`）。单条命令超时不超过 30s，尽量控制在 5s 内；超时后重跑检查，不要无限等待。
- Before writing or changing tests, read the `AGENTS.md` that owns the suite: `packages/app/e2e/AGENTS.md` (Playwright keeper suites in `regression/`), `packages/session-ui` (component tests in `component-tests/`), or `packages/desktop/AGENTS.md` (Electron main-process and IPC tests). `.aicraft/skills` holds project skills, not test skills.

## Checks

- 迭代时只验证改动的包：在包目录跑 `bun typecheck`，并跑 `bun run lint:changed`。`bun run check`（全量 lint + typecheck）只作为提交前的最终验证，不要在每次小改动后反复跑。
- During focused iteration, run `bun typecheck` from the affected package directory (for example, `packages/core`). Never run `tsc` directly.
- Local `typecheck` scripts use `bun check`. CI and package publishing run `typecheck:tsc`, which uses the official TypeScript compiler (`@typescript/native`). When the two disagree, `tsc` is the source of truth; reproduce with `bun run typecheck:tsc` from the package directory.
- `bun check` aims to match TypeScript 7.1, not the `7.0.2` that `process.versions.typescript` reports (oven-sh/bun#46536). When `bun check` and `tsc` from the pinned `@typescript/native` report different errors, file a minimal, dependency-free repro at https://github.com/oven-sh/bun/issues, with the output of both. `bun check` writes no declaration files, so declaration-emit errors such as TS5088 or TS2883 are expected to appear only in `tsc`; do not report those.

## Session Core

- Keep durable events minimal: record irreducible new facts and do not repeat state derivable by folding the ordered aggregate history. Enrich projections and read models with previous or derived state when consumers need self-contained views.
- Keep durable prompt admission separate from model execution. `Session.prompt(...)` publishes `session.inbox.enqueued`, whose projection inserts one durable `session_inbox` row, before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. Delivery publishes `session.inbox.delivered`; its projection consumes the inbox row and inserts the visible message in the same transaction. `session_inbox` stores only unconsumed work.
- Reusing a Session ID adopts the existing Session. Reusing a user or synthetic inbox item ID is idempotent when Session and type match: the first admission wins and the retried payload, metadata, and delivery mode are ignored, whether the item is still pending or already delivered (reconciled from the projected message without retained enqueue history). Cross-Session or cross-type reuse fails. Control items keep their operation-specific conflict behavior.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. Interruption targets the active process-local ownership chain for that Session; interruption of a known but idle or locally unowned Session is a no-op, while the public API rejects an unknown Session.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Each step is one explicit `llm.stream` call that continues from reloaded history. Do not add an in-memory tool loop.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. A write-ahead execution claim marks a process-local busy period for restart recovery: terminal completion, failure, or user interruption releases it, while shutdown interruption and process death preserve it. Startup recovery resumes claimed top-level Sessions with durable per-execution attempt accounting. The claim is a recovery marker, not clustered ownership, fencing, or an exactly-once guarantee.
- Keep delivery vocabulary explicit. Prompts steer by default. At safe step boundaries, steered compaction takes priority up to the first steered move control; other steers retain enqueue order. At an idle boundary, steers take priority; otherwise exactly one queued item delivers before the runner reevaluates continuation. Inbox items may be cancelled or changed between queue and steer before delivery. Promoting new user input resets the selected agent's step allowance; a batch of steers resets it once.
- One step is one logical LLM call; its durable record covers only the model-visible span. Do not write "provider turn", and do not use bare "turn" for a single call: "turn" is reserved for the future assistant-turn unit containing all steps from prompt promotion until the session would go idle.
- Keep event replay ownership separate from clustered Session execution ownership.
