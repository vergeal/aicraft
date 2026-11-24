export * as Config from "./config.js"

import { makeLocationNode } from "@aicraft/util/effect/app-node"
import path from "path"
import { isDeepStrictEqual } from "node:util"
import { applyEdits, modify, type ParseError, parse } from "jsonc-parser"
import { Context, Effect, FiberMap, Layer, Option, PubSub, Schema, Semaphore, Stream } from "effect"
import { Directory, Document, Info, ProviderPatch, type Patch, type Entry, Event } from "@aicraft/schema/config"
import { Credential } from "./credential.js"
import { Bus } from "./bus.js"
import { Watcher } from "./filesystem/watcher.js"
import { FSUtil } from "@aicraft/util/fs-util"
import { Global } from "@aicraft/util/global"
import { Location } from "./location.js"
import { Provider } from "./provider.js"
import { AbsolutePath } from "./schema.js"
import { ConfigVariable } from "./config/variable.js"
import { ConfigNormalize } from "./config/normalize.js"
import { ConfigDiscovery } from "./config/discovery.js"
import { ConfigWatch } from "./config/watch.js"
import { ConfigIntegration } from "./config/integration.js"
import { ConfigManaged } from "./config/managed.js"
import { ManagedPolicy } from "./managed-policy.js"
import { Connection } from "@aicraft/schema/connection"
import { WellKnown } from "./wellknown.js"
import { AppProcess } from "@aicraft/util/process"
import { ChildProcess } from "effect/process"

export function latest<K extends keyof Info>(entries: readonly Entry[], key: K): Info[K] | undefined {
  return entries.findLast((entry): entry is Document => entry.type === "document" && entry.info[key] !== undefined)
    ?.info[key]
}

export interface Interface {
  /** Returns location config documents and discovery sources from lowest to highest priority. */
  readonly entries: () => Effect.Effect<Entry[]>
  /**
   * The entries `entries()` returns, read synchronously. Transforms read this, so a reload that runs right after a
   * config change, such as an integration replacing its document, sees the change before `config.updated` arrives.
   */
  readonly snapshot: () => Entry[]
  /** Compatibility roots consumed by internal compatibility plugins. */
  readonly compatibility?: () => Effect.Effect<{
    readonly claude: readonly AbsolutePath[]
    readonly agents: readonly AbsolutePath[]
  }>
  /**
   * Streams raw filesystem updates under config roots. Config owns root
   * topology and watch reconciliation; domain owners filter this feed for the
   * source files they parse and rebuild their own state.
   */
  readonly changes: () => Stream.Stream<Watcher.Update>
  /** Updates supported global config fields while preserving unrelated JSONC content. */
  readonly update?: (patch: Patch) => Effect.Effect<void, FSUtil.Error>
  /**
   * Replaces, or clears with `undefined`, the document an integration connection contributes. It loads right after
   * managed policies: its settings layer below remote, user, and project config, while its policies outrank theirs.
   * Changing it reloads config like any other source.
   */
  readonly integration?: (
    integrationID: ConfigIntegration.Document["integrationID"],
    document: ConfigIntegration.Document | undefined,
  ) => Effect.Effect<void>
}

export const Options = Schema.Struct({
  project: Schema.optional(Schema.Boolean),
  // false skips the system and global config dirs, ~/.claude, and ~/.agents;
  // wellknown, file, and content entries still load.
  global: Schema.optional(Schema.Boolean),
  system: Schema.optional(Schema.Union([Schema.Boolean, Schema.String])),
  // false skips ~/.claude and project .claude dirs.
  claude: Schema.optional(Schema.Boolean),
  file: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

export class Service extends Context.Service<Service, Interface>()("@aicraft/Config") {}

export interface TestInterface extends Interface {
  /** Replaces the entries returned by subsequent entries() calls. */
  readonly setEntries: (entries: Entry[]) => Effect.Effect<void>
  /** Emits one filesystem update to every changes() subscriber. */
  readonly emitChange: (update: Watcher.Update) => Effect.Effect<void>
}

export class Test extends Context.Service<Test, TestInterface>()("@aicraft/Config/Test") {}

/** In-memory config for tests: static entries with replaceable state and a test-driven change feed. */
export const testLayer = (
  initial: Entry[] = [],
  compatibility: { readonly claude: readonly AbsolutePath[]; readonly agents: readonly AbsolutePath[] } = {
    claude: [],
    agents: [],
  },
) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const state = { entries: initial, integrations: new Map<string, ConfigIntegration.Document>() }
      const updates = yield* PubSub.unbounded<Watcher.Update>()
      const snapshot = () => [...state.integrations.values(), ...state.entries]
      const service = Test.of({
        entries: () => Effect.sync(snapshot),
        snapshot,
        compatibility: () => Effect.succeed(compatibility),
        changes: () => Stream.fromPubSub(updates),
        setEntries: (next) =>
          Effect.sync(() => {
            state.entries = next
          }),
        emitChange: (update) => PubSub.publish(updates, update).pipe(Effect.asVoid),
        integration: (integrationID, document) =>
          Effect.sync(() => {
            const next = new Map(state.integrations)
            next.delete(integrationID)
            state.integrations = document ? next.set(integrationID, document) : next
          }),
      })
      return Context.empty().pipe(Context.add(Service, service), Context.add(Test, service))
    }),
  )

export const layer = (options?: Options) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const watcher = yield* Watcher.Service
      const bus = yield* Bus.Service
      const credentials = yield* Credential.Service
      const globalService = yield* Global.Service
      const wellknown = yield* WellKnown.Service
      const processes = yield* AppProcess.Service
      const integrations = new Map<string, ConfigIntegration.Document>()
      // Integrations set their documents from outside this layer, so their reloads run with its services.
      const context = yield* Effect.context<FSUtil.Service | Global.Service | Location.Service>()
      const reloadLock = Semaphore.makeUnsafe(1)
      const updateLock = Semaphore.makeUnsafe(1)
      const decodeOptions = { errors: "all", onExcessProperty: "ignore" } as const
      const decodeInfo = Schema.decodeUnknownOption(Info, decodeOptions)
      const encodeProviderPatch = Schema.encodeSync(ProviderPatch)
      const parseInfo = Effect.fn("Config.parseInfo")(function* (text: string, source: string) {
        const errors: ParseError[] = []
        const input: unknown = parse(text, errors, { allowTrailingComma: true })
        if (errors.length) {
          yield* Effect.logWarning("configuration normalization diagnostic", {
            source,
            path: "$",
            kind: "invalid",
            action: "rejected malformed JSON or JSONC document",
          })
          return
        }
        const result = ConfigNormalize.normalize(input)
        yield* Effect.forEach(result.diagnostics, (diagnostic) =>
          Effect.logWarning("configuration normalization diagnostic", {
            source,
            path: diagnostic.path[0] === "$" ? "$" : `$.${diagnostic.path.join(".")}`,
            kind: diagnostic.kind,
            action: diagnostic.message,
          }),
        )
        if (result.type === "rejected") return
        const info = Option.getOrUndefined(decodeInfo(result.encoded))
        if (info) return info
        yield* Effect.logWarning("configuration normalization diagnostic", {
          source,
          path: "$",
          kind: "invalid",
          action: "rejected canonical configuration after final validation",
        })
      })

      const loadFile = Effect.fnUntraced(function* (filepath: string) {
        const text = yield* fs.readFileStringSafe(filepath)
        if (text === undefined) return
        const substituted = yield* ConfigVariable.substitute({ type: "path", path: filepath, text })
        const info = yield* parseInfo(substituted, filepath)
        if (!info) return
        return new Document({ type: "document", path: AbsolutePath.make(filepath), info })
      })

      const loadWellknownEntry = Effect.fnUntraced(function* (entry: WellKnown.Entry) {
        const auth = entry.manifest.auth
        const credential = (yield* credentials.list(entry.integrationID)).at(-1)
        const variables = auth && credential?.value.type === "key" ? { [auth.env]: credential.value.key } : undefined
        // A failed refresh, including a missing credential, keeps the last resolved config so remote providers
        // and allowlists do not disappear; only removing the source clears it.
        const configs = yield* (
          variables ? wellknown.resolve(entry, variables) : Effect.fail(new Error("No usable wellknown credential"))
        ).pipe(
          Effect.catch((error) =>
            Effect.logWarning("failed to load wellknown config", { source: entry.origin, error }).pipe(
              Effect.andThen(wellknown.cached(entry.origin)),
            ),
          ),
        )
        return yield* Effect.forEach(configs, (config) =>
          ConfigVariable.substitute({
            type: "virtual",
            source: entry.origin,
            dir: entry.origin,
            text: JSON.stringify(config),
            env: variables,
          }).pipe(
            Effect.flatMap((text) => parseInfo(text, entry.origin)),
            Effect.map((info) =>
              info
                ? new ConfigIntegration.WellKnownDocument({
                    type: "document",
                    info,
                    integrationID: entry.integrationID,
                  })
                : undefined,
            ),
          ),
        ).pipe(Effect.map((documents) => documents.filter((document) => document !== undefined)))
      })

      const loadWellknown = Effect.fn("Config.loadWellknown")(function* () {
        const entries = yield* wellknown
          .entries()
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning("failed to discover wellknown config", { error }).pipe(Effect.as([] as const)),
            ),
          )
        return yield* Effect.forEach(entries, (entry) =>
          loadWellknownEntry(entry).pipe(
            Effect.map((documents) => ({ integrationID: entry.integrationID, documents })),
          ),
        )
      })

      // `integration.use` decides whether an integration may supply anything. Only managed policies can withhold the
      // documents an integration delivers, so a project file can never strip the Console document carrying org policy.
      // A withheld document keeps its policies, so denying an integration never lifts the restrictions it carries.
      const supplies = Effect.fnUntraced(function* (
        lockdown: ReturnType<typeof ManagedPolicy.statements>,
        integrationID: string,
        connection?: Connection.Info,
      ) {
        const stored =
          connection?.type === "credential" ? yield* credentials.get(Credential.ID.make(connection.id)) : undefined
        const resource = ManagedPolicy.integrationResource(
          integrationID,
          stored ? ManagedPolicy.account(stored.value) : undefined,
        )
        return ManagedPolicy.decision(lockdown, "integration.use", resource) !== "deny"
      })

      const loadPreferences = Effect.fn("Config.loadPreferences")(function* (plist: AbsolutePath) {
        const result = yield* processes
          .run(ChildProcess.make("plutil", ["-convert", "json", "-o", "-", plist], { stdin: "ignore" }), {
            timeout: "10 seconds",
          })
          .pipe(Effect.flatMap(AppProcess.requireSuccess), Effect.option)
        if (Option.isNone(result)) {
          yield* Effect.logWarning("failed to convert managed preferences", { source: plist })
          return []
        }
        const text = yield* ConfigVariable.substitute({
          type: "virtual",
          source: plist,
          dir: path.dirname(plist),
          text: ConfigDiscovery.stripPreferenceMetadata(result.value.stdout.toString()),
        })
        const info = yield* parseInfo(text, plist)
        return info ? [new Document({ type: "document", path: plist, info })] : []
      })

      const loadDirectory = Effect.fnUntraced(function* (directory: AbsolutePath) {
        return [
          ...(yield* Effect.forEach(ConfigDiscovery.names, (file) => loadFile(path.join(directory, file))).pipe(
            Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
          )),
          new Directory({ type: "directory", path: directory }),
        ]
      })

      const load = Effect.fn("Config.load")(function* (sources: ConfigDiscovery.Sources) {
        const direct = yield* Effect.forEach(sources.direct, (filepath) => loadFile(filepath)).pipe(
          Effect.orDie,
          Effect.map((entries) => entries.filter((entry): entry is Document => entry !== undefined)),
        )

        const explicit = sources.explicit
          ? yield* loadFile(sources.explicit).pipe(
              Effect.map((config) => (config ? [config] : [])),
              Effect.orDie,
            )
          : []
        const content =
          options?.content !== undefined
            ? yield* ConfigVariable.substitute({
                type: "virtual",
                source: "AICRAFT_CONFIG_CONTENT",
                dir: location.directory,
                text: options.content,
              }).pipe(
                Effect.flatMap((text) => parseInfo(text, "AICRAFT_CONFIG_CONTENT")),
                Effect.map((info) => (info ? [new Document({ type: "document", info })] : [])),
                Effect.orDie,
              )
            : []

        // Managed settings load last so they override everything, and MDM
        // preferences outrank the system directory as in V1. Policies evaluate
        // in reverse load order, so managed policies split off and load first
        // to keep final file-based authority.
        const managed = [
          ...(sources.system?.present ? yield* loadDirectory(sources.system.path).pipe(Effect.orDie) : []),
          ...(sources.preferences ? yield* loadPreferences(sources.preferences).pipe(Effect.orDie) : []),
        ]
        const managedPolicies = managed
          .flatMap((entry) =>
            entry.type === "document" && entry.info.policies
              ? [
                  new ConfigManaged.Document({
                    type: "document",
                    path: entry.path,
                    info: new Info({ policies: entry.info.policies }),
                  }),
                ]
              : [],
          )
          .toReversed()
        const managedSettings = managed.map((entry) =>
          entry.type === "document"
            ? new ConfigManaged.Document({ ...entry, info: new Info({ ...entry.info, policies: undefined }) })
            : entry,
        )
        // Integration documents load right after managed policies: every remote, user, and project layer overrides
        // their settings, and since policies evaluate earliest-loaded first, only managed policies outrank theirs.
        // Global entries sit below explicit and direct files; project directories rank above them.
        const globalSupplementary = sources.global ? yield* loadDirectory(sources.global).pipe(Effect.orDie) : []
        const projectSupplementary = yield* Effect.forEach(
          sources.project.filter((root) => root.present),
          (root) => loadDirectory(root.path),
        ).pipe(
          Effect.orDie,
          Effect.map((entries) => entries.flat()),
        )
        const lockdown = ManagedPolicy.statements(managedPolicies)
        const integrated = yield* Effect.forEach(integrations.values(), (document) =>
          supplies(lockdown, document.integrationID, document.connection).pipe(
            Effect.map((allowed) =>
              allowed
                ? document
                : new ConfigIntegration.Document({ ...document, info: new Info({ policies: document.info.policies }) }),
            ),
          ),
        )
        const wellknownDocuments = yield* Effect.forEach(yield* loadWellknown().pipe(Effect.orDie), (entry) =>
          supplies(lockdown, entry.integrationID).pipe(
            Effect.map((allowed) =>
              allowed
                ? entry.documents
                : entry.documents.map(
                    (document) =>
                      new ConfigIntegration.WellKnownDocument({
                        ...document,
                        info: new Info({ policies: document.info.policies }),
                      }),
                  ),
            ),
          ),
        )
        return [
          ...managedPolicies,
          ...integrated,
          ...wellknownDocuments.flat(),
          ...globalSupplementary,
          ...explicit,
          ...direct,
          ...projectSupplementary,
          ...content,
          ...managedSettings,
        ]
      })

      const initial = yield* ConfigDiscovery.discover(options)
      let sources = initial
      let configs = yield* load(initial)
      const updates = yield* PubSub.unbounded<Watcher.Update>()
      const reloads = yield* PubSub.sliding<void>(1)
      // Readiness rescans recover writes made before a watch attached.
      const requestReload = PubSub.publish(reloads, undefined).pipe(Effect.asVoid)
      const watched = yield* FiberMap.make<string>()
      const reconcile = Effect.fn("Config.reconcileWatches")(function* (sources: ConfigDiscovery.Sources) {
        const plan = ConfigWatch.plan(sources)
        for (const key of Array.from(watched, ([key]) => key)) {
          if (!plan.has(key)) yield* FiberMap.remove(watched, key)
        }
        for (const [key, target] of plan) {
          yield* watcher
            .subscribe(target, requestReload)
            .pipe(
              Effect.flatMap(
                Stream.runForEach((update) => PubSub.publish(updates, update).pipe(Effect.andThen(requestReload))),
              ),
              FiberMap.run(watched, key, { onlyIfMissing: true, startImmediately: true }),
            )
        }
      })

      const reload = Effect.fn("Config.reload")(
        function* () {
          const discovered = yield* ConfigDiscovery.discover(options)
          const next = yield* load(discovered)
          yield* reconcile(discovered)
          const compatibilityChanged =
            !isDeepStrictEqual(sources.claude, discovered.claude) ||
            !isDeepStrictEqual(sources.agents, discovered.agents)
          if (isDeepStrictEqual(configs, next) && !compatibilityChanged) return
          sources = discovered
          configs = next
          yield* bus.publish(Event.Updated, {})
        },
        (effect) => reloadLock.withPermit(effect),
      )

      // Subscribe eagerly so synchronous watch readiness isn't dropped.
      const pendingReloads = yield* PubSub.subscribe(reloads)
      yield* Stream.fromSubscription(pendingReloads).pipe(
        Stream.debounce("100 millis"),
        Stream.runForEach(() =>
          reload().pipe(Effect.catchCause((cause) => Effect.logError("failed to reload config", { cause }))),
        ),
        Effect.forkScoped({ startImmediately: true }),
      )
      yield* bus.subscribe(Credential.Event.Switched).pipe(
        Stream.filterEffect((event) =>
          wellknown.entries().pipe(
            Effect.map((entries) => entries.some((entry) => entry.integrationID === event.data.integrationID)),
            Effect.orElseSucceed(() => false),
          ),
        ),
        Stream.runForEach(() =>
          reload().pipe(Effect.catchCause((cause) => Effect.logError("failed to reload wellknown config", { cause }))),
        ),
        Effect.forkScoped({ startImmediately: true }),
      )
      yield* bus.subscribe(WellKnown.Event.Updated).pipe(
        Stream.runForEach(() =>
          reload().pipe(Effect.catchCause((cause) => Effect.logError("failed to reload wellknown sources", { cause }))),
        ),
        Effect.forkScoped({ startImmediately: true }),
      )
      yield* Effect.sleep("10 minutes").pipe(
        Effect.andThen(
          Effect.suspend(() => {
            if (!wellknown.snapshot().length) return Effect.void
            return Effect.gen(function* () {
              const changed = yield* wellknown
                .refresh()
                .pipe(
                  Effect.catch((error) =>
                    Effect.logWarning("failed to refresh wellknown manifests", { error }).pipe(Effect.as(false)),
                  ),
                )
              if (!changed) yield* reload()
            }).pipe(Effect.catchCause((cause) => Effect.logWarning("failed to refresh wellknown config", { cause })))
          }),
        ),
        Effect.forever,
        Effect.forkScoped({ startImmediately: true }),
      )
      yield* reloadLock.withPermit(reconcile(initial))

      // The global files update() may write, resolved the same way in both places so a client's `writable` marker
      // cannot drift from the document a patch actually lands in. Only the global directory is eligible: the system
      // directory (e.g. %ProgramData%\aicraft) is not the user's to rewrite.
      const writeTarget = Effect.fnUntraced(function* () {
        const directory = initial.global ?? AbsolutePath.make(globalService.config)
        const existing = yield* Effect.filter(
          ConfigDiscovery.names.map((name) => path.join(directory, name)),
          fs.isFile,
        )
        return { directory, existing }
      })

      const object = (value: unknown) =>
        value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

      // JSONC parsing returns undefined for malformed input instead of throwing, so a broken file simply has no
      // settings to merge into.
      const documentSettings = (value: string) => object(parse(value, [], { allowTrailingComma: true }))

      // The key a provider is declared under: v2 `providers`, or the v1 singular `provider` a migrated file may keep.
      const providerSectionKey = (value: string, id: string) => {
        const parsed = documentSettings(value)
        for (const key of ["providers", "provider"] as const) {
          if (Object.hasOwn(object(parsed[key]), id)) return key
        }
        return undefined
      }

      // Where a provider that is new to this file goes: the section the file already uses, so a v1 document never
      // grows a second `providers` key beside its `provider`.
      const providerSection = (value: string) => {
        const parsed = documentSettings(value)
        for (const key of ["providers", "provider"] as const) {
          const section = parsed[key]
          if (section && typeof section === "object" && !Array.isArray(section)) return key
        }
        return "providers" as const
      }

      const providerEntry = (value: string, id: string) => {
        const key = providerSectionKey(value, id)
        return key === undefined ? undefined : object(documentSettings(value)[key])[id]
      }

      const update = Effect.fn("Config.update")(
        function* (patch: Patch) {
          // Every global document is writable, so one patch can touch several files: each provider lands in the file
          // that already declares it. Plugins, shell and a provider with no home yet go to the default target.
          const target = yield* writeTarget()
          const fallback = target.existing.at(-1) ?? path.join(target.directory, "aicraft.jsonc")
          const files = [...new Set([...target.existing, fallback])]
          const texts = new Map(
            yield* Effect.forEach(files, (file) =>
              fs.readFileStringSafe(file).pipe(Effect.map((text) => [file, text ?? "{}\n"] as const)),
            ),
          )
          const home = (id: string) =>
            files.find((file) => providerSectionKey(texts.get(file) ?? "{}\n", id) !== undefined) ?? fallback
          const assigned = new Map(
            files.map((file) => [file, Object.keys(patch.providers ?? {}).filter((id) => home(id) === file)]),
          )

          // A model sent as `{}` keeps the document's own entry, which preserves its raw configuration instead of
          // re-encoding a decoded one.
          const mergeModels = (raw: Record<string, unknown>, models: Readonly<Record<string, unknown>>) =>
            Object.fromEntries(
              Object.entries(models).map(([id, entry]) => [
                id,
                Object.keys(object(entry)).length === 0 && object(raw.models)[id] !== undefined
                  ? object(raw.models)[id]
                  : entry,
              ]),
            )
          // Provider-level shallow merge. Settings merge one level deeper so an unrelated setting the editor never
          // shows survives.
          const mergeProvider = (base: unknown, patch: ProviderPatch) => {
            const raw = object(base)
            const models = patch.models === undefined ? raw.models : mergeModels(raw, patch.models)
            return {
              ...raw,
              ...patch,
              settings: { ...object(raw.settings), ...object(patch.settings) },
              ...(models === undefined ? {} : { models }),
            }
          }
          // A v1 `provider` entry names the same things differently: `npm` for the package and `options` for the
          // settings overlays. Writing the current names there parses but is dropped by the v1 decoder, so the edit
          // would silently do nothing. `canonical` and `compatibility` have no v1 field and are left out.
          const mergeLegacyProvider = (base: unknown, patch: ProviderPatch) => {
            const raw = object(base)
            const { package: pkg, settings, headers, body, models, canonical, compatibility, ...rest } = patch
            const baseURL = object(settings).baseURL
            const overlay =
              settings === undefined && headers === undefined && body === undefined
                ? undefined
                : {
                    ...object(raw.options),
                    ...object(settings),
                    ...(headers === undefined ? {} : { headers }),
                    ...(body === undefined ? {} : { body }),
                  }
            return {
              ...raw,
              ...rest,
              ...(pkg === undefined || Object.hasOwn(raw, "npm") ? {} : { npm: Provider.packageName(pkg) }),
              // v1 reads the overlays out of `options` and lets `api` override its base URL, so both stay in step.
              ...(overlay === undefined ? {} : { options: overlay }),
              ...(baseURL === undefined || !Object.hasOwn(raw, "api") ? {} : { api: baseURL }),
              ...(models === undefined ? {} : { models: mergeModels(raw, models) }),
            }
          }
          // Encoded, so an omitted optional field cannot reach the document as `null` or as an explicit
          // `undefined` value.
          const encoded = (value: ProviderPatch) => encodeProviderPatch(value)

          const render = (text: string, ids: string[], primary: boolean) => {
            const formattingOptions = { tabSize: 2, insertSpaces: true }
            let current = text
            if (primary && patch.plugins !== undefined && patch.plugins.length > 0) {
              const parsed = documentSettings(current)
              const legacy = Array.isArray(parsed.plugin) ? parsed.plugin : []
              const declared = Array.isArray(parsed.plugins) ? parsed.plugins : []
              const existing = [...legacy, ...declared].filter((item): item is string => typeof item === "string")
              const added = new Set(patch.plugins)
              // Installing also lifts a former `-name` disable, so the user gets the plugin they just asked for.
              const merged = [...new Set([...existing, ...patch.plugins])].filter(
                (item) => !(item.startsWith("-") && added.has(item.slice(1))),
              )
              current = applyEdits(current, modify(current, ["plugins"], merged, { formattingOptions }))
              if (legacy.length > 0) {
                current = applyEdits(current, modify(current, ["plugin"], undefined, { formattingOptions }))
              }
            }
            if (primary && patch.shell !== undefined) {
              current = applyEdits(
                current,
                modify(current, ["shell"], patch.shell ?? undefined, { formattingOptions }),
              )
            }
            // One provider key at a time, so a provider edit never rewrites the rest of the document. The merge base
            // is the file's own JSONC node, not the decoded Info: `{file:…}` and `{env:…}` substitutions happen
            // before parsing, so merging the resolved Info would write a secret into the document.
            for (const id of ids) {
              const value = (patch.providers ?? {})[id] ?? null
              // Follow the key the file already uses, so a v1 `provider` document never grows a `providers` copy.
              const key = providerSectionKey(current, id) ?? providerSection(current)
              const merged =
                value === null
                  ? undefined
                  : key === "provider"
                    ? mergeLegacyProvider(providerEntry(current, id), encoded(value))
                    : mergeProvider(providerEntry(current, id), encoded(value))
              current = applyEdits(current, modify(current, [key, id], merged, { formattingOptions }))
            }
            return current
          }

          // A file is only rewritten when the patch changes something in it, so an untouched document keeps its bytes
          // and does not trigger a reload.
          const touches = (patch.plugins?.length ?? 0) > 0 || patch.shell !== undefined
          const writes = files.flatMap((file) => {
            const ids = assigned.get(file) ?? []
            const primary = file === fallback
            return ids.length === 0 && !(primary && touches)
              ? []
              : [{ file, text: texts.get(file) ?? "{}\n", ids, primary }]
          })
          yield* Effect.forEach(writes, (write) =>
            Effect.gen(function* () {
              const updated = yield* Effect.try({
                try: () => render(write.text, write.ids, write.primary),
                catch: (cause) => new FSUtil.FileSystemError({ method: "config.update", cause }),
              })
              yield* fs.writeWithDirs(write.file, updated.endsWith("\n") ? updated : `${updated}\n`)
            }),
          )
          yield* requestReload
        },
        (effect) => updateLock.withPermit(effect),
      )

      return Service.of({
        entries: Effect.fnUntraced(function* () {
          // Mark every document update() may write. A provider the UI can edit is one declared in a global document;
          // anything else (a project file, a managed policy) is read-only for the editor.
          const target = (yield* writeTarget()).existing
          if (target.length === 0) return configs
          return configs.map((entry) =>
            entry.type === "document" && entry.path !== undefined && target.includes(entry.path)
              ? new Document({ type: "document", path: entry.path, writable: true, info: entry.info })
              : entry,
          )
        }),
        snapshot: () => configs,
        compatibility: () =>
          Effect.all({
            claude: Effect.filter(sources.claude, fs.isDir),
            agents: Effect.filter(sources.agents, fs.isDir),
          }),
        changes: () => Stream.fromPubSub(updates),
        update,
        integration: Effect.fn("Config.integration")(function* (integrationID, document) {
          if (isDeepStrictEqual(integrations.get(integrationID), document)) return
          integrations.delete(integrationID)
          if (document) integrations.set(integrationID, document)
          yield* reload().pipe(
            Effect.provide(context),
            Effect.catchCause((cause) => Effect.logError("failed to reload config", { cause })),
          )
        }),
      })
    }),
  )

export function configured(options?: Options) {
  return makeLocationNode({
    service: Service,
    layer: layer(options),
    deps: [
      Watcher.node,
      Bus.node,
      FSUtil.node,
      Global.node,
      Location.node,
      Credential.node,
      WellKnown.node,
      AppProcess.node,
    ],
  })
}

export const node = configured()
