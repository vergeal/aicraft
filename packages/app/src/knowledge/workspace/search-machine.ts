import type { SearchHit } from "./data"

/**
 * Retrieval moves through four observable phases. Each result carries the attempt it answers, so a
 * slow response for an abandoned query can never replace the results the user is looking at.
 */
export type SearchState =
  | { status: "idle" }
  | { status: "searching"; query: string; attempt: number }
  | { status: "ready"; query: string; attempt: number; hits: SearchHit[]; elapsed: number }
  | { status: "failed"; query: string; attempt: number; message: string }

export type SearchEvent =
  | { type: "query.submitted"; query: string; attempt: number }
  | { type: "query.completed"; attempt: number; hits: SearchHit[]; elapsed: number }
  | { type: "query.failed"; attempt: number; message: string }
  | { type: "query.cleared" }

const IDLE: SearchState = { status: "idle" }

export function transition(state: SearchState, event: SearchEvent): SearchState {
  if (event.type === "query.cleared") return IDLE

  if (event.type === "query.submitted") {
    return { status: "searching", query: event.query, attempt: event.attempt }
  }

  // Results for an older attempt belong to a query the user already replaced.
  if (state.status !== "searching" || state.attempt !== event.attempt) return state

  if (event.type === "query.completed") {
    return { status: "ready", query: state.query, attempt: state.attempt, hits: event.hits, elapsed: event.elapsed }
  }

  return { status: "failed", query: state.query, attempt: state.attempt, message: event.message }
}

/** The hits worth showing, empty while the query is still running. */
export function visibleHits(state: SearchState) {
  return state.status === "ready" ? state.hits : []
}
