export * as RowKey from "./row-key.js"

/**
 * The expansion key for one row of the assembly panel.
 *
 * A row's source key is not unique inside its layer: L4 lists a pending notice of a change *and* the
 * request's own account of the block that carried it, so `core/skill-guidance` can appear twice and the
 * two rows mean different things. Keying only by source made opening one row open both.
 *
 * The list a row came from is therefore part of its identity, and so is its position: two rows can share
 * both source and list (the same source reported twice in one request), and the notice list grows as the
 * ledger settles, so position inside a list is stable while position across the layer is not.
 */
export const make = (input: {
  readonly layer: string
  readonly origin?: string
  readonly index: number
  readonly source: string
}) => [input.layer, input.origin ?? "", String(input.index), input.source].join("\u0000")
