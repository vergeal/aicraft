# Memory Subsystem Package Guide

`@aicraft/memory` is the decision core of the memory system: retrieval fusion, injection
rendering, dedup and lifecycle rules, expressed as pure TypeScript over narrow ports. It owns
no IO, no Effect services, no layers — everything that touches a database, a subprocess, a
network, or a session lives in `@aicraft/core` adapters that implement the ports here.

## Package Boundary

- **Zero runtime dependencies.** No `effect`, no `@aicraft/schema`, no `bun:*` imports in
  `src/`. The package must stay runnable in any host (bun, node, tests) exactly as written.
  DevDependencies only carry the typecheck toolchain.
- The wire contract's canonical source stays `@aicraft/schema/memory` until the Phase 6
  contract extension; this package defines the internal record model (`MemoryRecord`) that
  the Phase 6 schema aligns to. Do not import schema to "share" types — the model is
  intentionally richer (type/status/version/embedding) and conversion happens in the core
  adapter.
- Ports (`Store`, `Embedder`, clock) are plain interfaces over Promises. Core wraps them in
  Effect layers at its own boundary; nothing in this package may know about that wrapping.
- Determinism rule: given the same records, settings and clock, every output (candidate
  order, injection block bytes) must be byte-identical. This is what makes the per-turn
  dynamic section safe to re-send every step without breaking provider prompt caches — an
  unstable renderer silently invalidates the whole cached prefix and multiplies cost.
- Thresholds are per-embedder configuration, not universal constants. Measured 2026-11 with
  the fake: relevant query/entry pairs score 0.12-0.27 and the unrelated noise floor reaches
  ~0.20 on a bulk corpus. Never "fix" a test by moving `DEFAULT_SETTINGS` toward the fake's
  range — override `settings` locally instead, as `test/vector.test.ts` and the `test/metrics.test.ts`
  sweep do. The real operating point is calibrated: `spike/real-vector.ts` against bge-small-zh-v1.5
  (llama-server) sets `vectorThreshold: 0.4` (see `DEFAULT_SETTINGS`).

## Acceptance Gate

- Every behavior added here must be testable as input → output in `test/` with the
  in-memory reference store and the deterministic fake embedder. If a test cannot be
  written that way, the logic is misplaced (belongs in the core adapter, not the subsystem).
- Run from this directory: `bun test`. Never from the repo root.
- The golden set in `test/fixtures.ts` gates retrieval quality: a change that regresses
  recall on it must not land without an explicit note here explaining why.
- `test/metrics.test.ts` is the acceptance gate in numbers, measured on the 421-entry corpus
  (`bulkFiller`) rather than a toy set, because the design input is ten-thousand-entry
  long-term use. Current gates, each with margin above the measured value: auto-inject recall
  ≥ 0.85 (lexical fallback, measured 1.0); search recall@5 = 1.0 (measured 1.0); false injection
  on unrelated queries = 0; injection precision ≥ 0.75 (measured 0.9); mean injected characters
  ≤ 300 and ≤ 25% of the legacy 4000-char window (measured 219 / 5.5%); byte stability 1.0;
  new inject recall ≥ 2× the old key-ordered window (measured 1.0 vs 0.33) and new search
  recall ≥ 0.9 vs the old substring match (measured 0.12). Fake-calibrated vector gates are
  weaker by design (inject recall ≥ 0.66, search ≥ 0.9 — measured 1.0 / 0.94): the fake is not
  semantic. The real operating point was measured 2026-11-26 with `spike/real-vector.ts` (needs a
  running `llama-server --embedding`, not part of `bun test`): recall 1.0, search@5 1.0, false
  injection 0, mean 264 chars, byte stability 1.0 at threshold 0.4 — every gate holds on the real
  model, and `DEFAULT_SETTINGS.vectorThreshold` encodes that operating point. Lowering a gate is a
  decision, not a test fix: state the measured before/after.
- The bulk corpus must survive its own dedup: 400 fillers must yield 400 inserts (measured
  worst pair containment 0.70 vs the 0.85 gate). Repeating whole topic sentences inside filler
  text collapses the corpus (measured 400 → 153 and → 246 with earlier templates) and silently
  voids every scale-dependent gate — `test/corpus` and the dedup test guard this.
- Save dedup runs three gates over a cross-scope candidate set (a project save also reads
  `global`, a global save also reads the originating project key): text hash (exact), token
  containment ≥ `nearDuplicateThreshold`, and embedding cosine ≥ `semanticDuplicateThreshold`
  when an embedder is configured. The semantic gate exists because containment is lexical:
  measured 2026-11 in the live corpus, six paraphrases of one "pp" habit saved by different
  models in different sessions each passed the 0.85 gate and all six injected on every turn.
  The 0.92 default is a conservative placeholder, NOT yet calibrated against bge-small-zh —
  the fake embedder is not semantic and dev runs carry no embedder. Calibrate with a spike
  before moving it, same rule as `vectorThreshold`.

## Layout

- `types.ts` — record model, settings, port interfaces, result shapes.
- `tokens.ts` — CJK bigram + ASCII word tokenizer shared by write and query sides.
- `settings.ts` — one boundary validation of `Settings` (hostile config falls back, never
  disables a channel).
- `lifecycle.ts` — injectable-type partition, text hashing, tag normalization, symmetric
  containment for near-dedup, `nextRow`/`supersededRow` version transforms, staleness.
- `query.ts` — channel scoring and fusion ranking.
- `inject.ts` — budget packing and the request-tail injection block renderer.
- `subsystem.ts` — the facade: `onTurn`, `save`, `update`, `supersede`, `remove`, `search`,
  `list`, `browse`, `history`, `addTrigger`, `sessionIndex`, `staleVectorIds`.
- `evaluate.ts` — the metric harness (corpus in, numbers out); the test gates and the future
  real-embedder spike both consume it, so "recall" has exactly one definition.
- `reference.ts` — in-memory `Store` and deterministic `Embedder` for tests and dry runs.

## Invariants

- `mem_*` ids never change: updates bump `version` on the same id, dedup keeps the original
  id. References handed to a model in earlier context must never dangle.
- Injection defaults to zero: only trigger-exact hits and threshold-passing vector/lexical
  candidates reach the request. The old "every step, up to the budget" full-scan window is
  gone for good — do not reintroduce it.
- A channel's candidate source is its index, never a recency window: the lexical channel reads
  `Store.lexicalCandidates` (token index), and `maxEntries` is only a page size for `list`.
  Measured 2026-11: sourcing lexical candidates from a recency window scored 0.22 recall on
  the 421-entry corpus because the entries worth retrieving are the oldest ones — the quieter
  twin of the kv kernel's newest-100 cap.
- Resolved by the 2026-11-26 golden-set spike (`spike/real-vector.ts`): with the real
  bge-small-zh-v1.5 at threshold 0.4, trigger ∪ vector alone carries the whole gold set
  (recall 1.0, false injection 0, mean 264 chars) — the turn block does NOT fuse the lexical
  channel. Lexical stays a search-only channel; do not add it to `onTurn` without a new
  spike measurement.
- Embedding failure degrades the vector channel silently; trigger and lexical channels must
  keep working without any embedder present.
