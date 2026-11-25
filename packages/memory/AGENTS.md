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
  ~0.20 on a bulk corpus, while a real sentence-embedding model scores the same pairs much
  higher (and its scores depend on whether it needs a retrieval instruction prefix). Never
  "fix" a test by moving `DEFAULT_SETTINGS` toward the fake's range — override `settings`
  locally instead, as `test/vector.test.ts` and the `test/metrics.test.ts` sweep do. The real
  operating point (threshold, top-k, recall/false-injection trade-off) comes from the
  golden-set spike against the actual model, not from this package.

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
  ≥ 0.85 (lexical fallback, measured 1.0); search recall@5 = 1.0 and recall@1 ≥ 0.8 (measured
  1.0); false injection on unrelated queries = 0; injection precision ≥ 0.75 (measured 0.9);
  mean injected characters ≤ 300 and ≤ 25% of the legacy 4000-char window (measured 116 /
  2.9%); byte stability 1.0; new inject recall ≥ 2× the old key-ordered window (measured
  1.0 vs 0.33) and new search recall ≥ 0.9 vs the old substring match (measured 0.12).
  Lowering a gate is a decision, not a test fix: state the measured before/after.

## Layout

- `types.ts` — record model, settings, port interfaces, result shapes.
- `tokens.ts` — CJK bigram + ASCII word tokenizer shared by write and query sides.
- `query.ts` — channel scoring and fusion ranking.
- `inject.ts` — budget packing and the request-tail injection block renderer.
- `subsystem.ts` — the facade: `onTurn`, `save`, `update`, `remove`, `search`, `list`.
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
- Open spike question, not a policy change: with a real embedder, injection is trigger ∪
  vector only, so literal matches the vector channel scores under the threshold never reach
  the request. On the fake that costs 0.78 recall versus 1.0 for the lexical fallback. Whether
  the turn block should fuse vector AND lexical at the real model's threshold is a golden-set
  spike decision — do not silently add the lexical channel to `onTurn`.
- Embedding failure degrades the vector channel silently; trigger and lexical channels must
  keep working without any embedder present.
