import { Provider } from "@opencode/core/provider"
import { ProviderModels } from "@opencode/core/provider/models"
import { ProviderNotFoundError, InvalidRequestError } from "@opencode/protocol/errors"
import { Effect, Predicate } from "effect"
import { FetchHttpClient, HttpClient, HttpClientError } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { awaitPlugins, response } from "../location"

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "provider.list",
        Effect.fn(function* () {
          yield* awaitPlugins
          const providers = yield* Provider.Service
          return yield* response(providers.available())
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const providers = yield* Provider.Service
          const provider = yield* providers.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          return yield* response(Effect.succeed(provider))
        }),
      )
      .handle(
        "provider.models",
        Effect.fn(function* (ctx) {
          // A probed endpoint is user-supplied, so this request uses its own fetch client instead of whatever
          // transport the caller's graph provides. `FetchHttpClient.Fetch` defaults to the runtime's fetch.
          const http = yield* HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer))
          const models = yield* ProviderModels.list(http, ctx.payload.baseURL, ctx.payload.apiKey).pipe(
            // The route only declares `InvalidRequestError`, so the reason travels in the message: the endpoint is
            // user-supplied, and "that failed" leaves the user with nothing to fix.
            Effect.catch((cause) =>
              Effect.fail(
                new InvalidRequestError({
                  message: modelsFailure(cause),
                  kind: "provider.models",
                }),
              ),
            ),
          )
          return { data: models }
        }),
      )
  }),
)

const endpointMessage =
  "This endpoint did not return a model list. Check the URL: OpenAI-compatible endpoints usually end with /v1."

// A bad key, a URL that is not a model list and a slow host need different fixes, so the failure keeps them apart.
// Anything else keeps the generic text.
function modelsFailure(cause: unknown) {
  if (Predicate.isTagged(cause, "TimeoutError")) return "The request timed out. Check the endpoint URL and try again."

  if (HttpClientError.isHttpClientError(cause)) {
    const status = cause.response?.status
    if (status === 401 || status === 403) return "The API key is invalid or expired. Check the key and try again."
    // A 200 that failed to decode is HTML or another body that is not the `{ data: [...] }` contract.
    if (status === 404 || status === 200) return endpointMessage
  }

  // `schemaBodyJson` rejects a non-JSON body with a `SchemaError` rather than a response error.
  if (Predicate.isTagged(cause, "SchemaError")) return endpointMessage

  const detail = Predicate.isObject(cause) && Predicate.isString(cause.message) ? `: ${cause.message}` : ""
  return `Could not list models from this endpoint${detail}`
}
