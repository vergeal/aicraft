export * as ProviderModels from "./models.js"

import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

// An OpenAI-compatible `/models` entry. Everything past the id is optional and unknown fields are ignored, so a
// gateway that returns a richer shape still lists.
const Entry = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
})

const Response = Schema.Struct({ data: Schema.Array(Schema.Unknown) })
const decodeEntry = Schema.decodeUnknownOption(Entry)

export type Entry = typeof Entry.Type

/**
 * Lists an OpenAI-compatible endpoint's models. A malformed entry is dropped rather than failing the whole list; a
 * malformed envelope or a failed request fails, because then there is nothing to show.
 */
export const list = Effect.fn("ProviderModels.list")(function* (
  http: HttpClient.HttpClient,
  baseURL: string,
  apiKey: string | undefined,
) {
  const request = apiKey
    ? HttpClientRequest.get(`${baseURL.replace(/\/+$/, "")}/models`).pipe(HttpClientRequest.bearerToken(apiKey))
    : HttpClientRequest.get(`${baseURL.replace(/\/+$/, "")}/models`)
  const response = yield* HttpClient.filterStatusOk(http)
    .execute(request)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Response)), Effect.timeout("8 seconds"))

  return response.data.flatMap((raw) => {
    const entry = Option.getOrUndefined(decodeEntry(raw))
    return entry ? [entry] : []
  })
})
