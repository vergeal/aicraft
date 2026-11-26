export * as FileDiff from "./file-diff.js"

import { Schema } from "effect"
import { NonNegativeInt, RelativePath, optional } from "./schema.js"

export const Info = Schema.Struct({
  file: Schema.String,
  patch: Schema.String,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  status: Schema.Literals(["added", "deleted", "modified"]),
  /** Marks the entry a folder listing adds for itself when it stopped before showing or checking every entry. */
  more: Schema.Literal(true).pipe(optional),
}).annotate({ identifier: "FileDiff.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

/**
 * Per-file change counts recorded when a step ends, stored on the assistant message so the
 * changed-files listing renders from the message alone. `binary` marks files git reports no line counts for.
 */
export const Summary = Schema.Struct({
  file: RelativePath,
  status: Schema.Literals(["added", "deleted", "modified"]),
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  binary: Schema.Literal(true).pipe(optional),
}).annotate({ identifier: "FileDiff.Summary" })
export interface Summary extends Schema.Schema.Type<typeof Summary> {}

/** V1 snapshot and persisted session diff shape. */
export const LegacyInfo = Schema.Struct({
  file: Schema.String.pipe(optional),
  patch: Schema.String.pipe(optional),
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.Literals(["added", "deleted", "modified"]).pipe(optional),
}).annotate({ identifier: "FileDiff.LegacyInfo" })
export interface LegacyInfo extends Schema.Schema.Type<typeof LegacyInfo> {}
