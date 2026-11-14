import { Provider } from "@opencode/core/provider"
import { ProviderModels } from "@opencode/core/provider/models"
import { ProviderNotFoundError, InvalidRequestError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
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
            // The route only declares `InvalidRequestError`; an unreachable endpoint, a non-JSON body and a timeout
            // all mean the same thing to the client, which offers manual entry instead.
            Effect.catch((cause) =>
              Effect.fail(
                new InvalidRequestError({
                  message: `Could not list models from this endpoint: ${cause.message}`,
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
