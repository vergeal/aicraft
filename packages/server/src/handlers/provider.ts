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
            // user-supplied, and "that failed" leaves the user with nothing to fix. The kind lets a client localize
            // the same reason without parsing the English text.
            Effect.catch((cause) => Effect.fail(new InvalidRequestError(modelsFailure(cause)))),
          )
          return { data: models }
        }),
      )
  }),
)

const endpointMessage =
  "This endpoint did not return a model list. Check the URL: OpenAI-compatible endpoints usually end with /v1."

// A bad key, a URL that is not a model list and an unreachable host need different fixes, so the failure keeps them
// apart. Anything else keeps the generic text. `kind` is the stable name a client localizes; the English message stays
// for every other caller.
function modelsFailure(cause: unknown): { message: string; kind: string } {
  const failure = (message: string, kind: string) => ({ message, kind })

  // `Effect.timeout` fails with `Cause.TimeoutError`, which is not an HTTP client error.
  if (Predicate.isTagged(cause, "TimeoutError"))
    return failure("The request timed out. Check the endpoint URL and try again.", "provider.models.timeout")

  const reason = HttpClientError.isHttpClientError(cause) ? cause.reason : undefined

  if (reason?._tag === "StatusCodeError") {
    const status = reason.response.status
    if (status === 401 || status === 403)
      return failure("The API key is invalid or expired. Check the key and try again.", "provider.models.auth")
    if (status === 404) return failure(endpointMessage, "provider.models.address")
  }

  // A `DecodeError` or an empty body arrives with status 200, so the status cannot tell it apart from a good response:
  // the body was HTML or another shape that is not the `{ data: [...] }` contract. `schemaBodyJson` reports a non-JSON
  // body as a `SchemaError` instead of an HTTP client error.
  if (reason?._tag === "DecodeError" || reason?._tag === "EmptyBodyError")
    return failure(endpointMessage, "provider.models.address")
  if (Predicate.isTagged(cause, "SchemaError")) return failure(endpointMessage, "provider.models.address")

  if (reason?._tag === "TransportError" || reason?._tag === "InvalidUrlError")
    return failure(
      "Could not connect to this endpoint. Check the URL and that the server is reachable.",
      "provider.models.connection",
    )

  const detail = Predicate.isObject(cause) && Predicate.isString(cause.message) ? `: ${cause.message}` : ""
  return failure(`Could not list models from this endpoint${detail}`, "provider.models")
}
