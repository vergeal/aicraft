import type { ScheduleInfo } from "@aicraft/client/promise"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Dialog, DialogBody, DialogTitle } from "@aicraft/ui/dialog"
import { FileIcon } from "@aicraft/ui/file-icon"
import { Icon } from "@aicraft/ui/icon"
import type { IconName } from "@aicraft/ui/icons/catalog"
import { Loader } from "@aicraft/ui/loader"
import { displayName } from "@aicraft/ui/project-avatar"
import { SearchProvider } from "@aicraft/plugin/gui"
import { SearchHighlight, SearchList, type SearchListRow } from "@aicraft/ui/search-list"
import { getDirectory, getFilename } from "@aicraft/util/path"
import { useNavigate } from "@solidjs/router"
import {
  createMemo,
  createResource,
  type JSX,
  Match,
  onCleanup,
  type Resource,
  Show,
  startTransition,
  Switch,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useInbox } from "@/inbox/context"
import { useKnowledgeLibraries } from "@/knowledge/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginAttachment } from "@/runtime/plugin/host-apis"
import { usePluginHost } from "@/runtime/plugin/host"
import { isServerFailed } from "@/runtime/server/health-machine"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useScheduled } from "@/scheduled/context"
import { taskName } from "@/scheduled/describe"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { useLayout } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { getRelativeTime } from "@/shell/time"
import {
  createCommandPaletteFileOpener,
  createKnownServerSessions,
  createServerSessionEntries,
  type CommandPaletteEntry,
} from "./palette"
import "./spotlight.css"

const ICONS: Record<Exclude<SpotlightItem["type"], "plugin">, IconName> = {
  session: "workspace",
  message: "bubble-5",
  file: "file-document",
  knowledge: "library",
  library: "library",
  inbox: "notifications",
  schedule: "checklist",
  project: "folder",
}

/** Per-group caps: Spotlight answers a query, it does not page through a whole history. */
const SESSION_LIMIT = 8

const MESSAGE_LIMIT = 8

const KNOWLEDGE_LIMIT = 6

const FILE_LIMIT = 8

/** Every plugin provider answers with at most this many results, so one source cannot push the rest out of view. */
const PLUGIN_LIMIT = 6

type SessionTarget = {
  server: ServerConnection.Key
  sessionID: string
  directory: string
  project?: CommandPaletteEntry["project"]
  archived: boolean
}

type SpotlightItem = { id: string; category: string; title: string; snippet?: string; meta?: string } & (
  | ({ type: "session" } & SessionTarget)
  | ({ type: "message" } & SessionTarget)
  | { type: "file"; path: string; directory: string; server: ServerConnection.Key }
  | { type: "knowledge"; libraryID: string }
  | { type: "library"; libraryID: string }
  | { type: "inbox"; key: string }
  | { type: "schedule"; taskID: string }
  | { type: "project"; server: ServerConnection.Key; directory: string }
  | { type: "plugin"; icon?: IconName; run: () => void }
)

/**
 * The global search behind Ctrl+K: sessions (archived ones included), chat text, knowledge, inbox items, scheduled
 * tasks and projects. It opens as an empty field and shows nothing until the user types, which keeps it a place to
 * ask rather than a launcher that lists every destination.
 */
export function Spotlight() {
  const dialog = useDialog()
  const global = useGlobal()
  const registry = useServers()
  const language = useLanguage()
  const tabs = useTabs()
  const navigate = useNavigate()
  const layout = useLayout()
  const inbox = useInbox()
  const scheduled = useScheduled()
  const libraries = useKnowledgeLibraries()
  const attachment = usePluginAttachment()
  const host = usePluginHost()
  const openFile = createCommandPaletteFileOpener()

  const [store, setStore] = createStore({ query: "" })
  const query = createMemo(() => store.query.trim())

  // A tag tells same-named results apart only when there is more than one server to tell apart.
  const tagOf = (conn: ServerConnection.Any) =>
    registry.visible.length < 2 ? undefined : registry.tag(conn)

  const targets = registry.visible.flatMap((conn) => {
    const key = ServerConnection.key(conn)
    const ctx = global.serverCtx(key)

    if (!ctx || isServerFailed(global.servers.health[key])) return []

    return [{ key, ctx, tag: tagOf(conn) }]
  })

  const sessions = targets.flatMap(({ key, ctx }) =>
    [false, true].map((archived) => ({
      archived,
      loader: createServerSessionEntries({
        server: key,
        archived,
        known: archived
          ? () => ctx.data.session.list().filter((session) => !session.parentID)
          : createKnownServerSessions(() => ctx),
        projects: ctx.projects.list,
        load: (search, signal) =>
          ctx.sdk.api.session.list({ parentID: null, search, archived, limit: 50 }, { signal }),
        get: (sessionID, signal) => ctx.sdk.api.session.get({ sessionID }, { signal }),
        untitled: () => language.t("command.session.new"),
        category: () => language.t("spotlight.group.sessions"),
        recentCategory: () => language.t("spotlight.group.sessions"),
      }),
    })),
  )

  const messages = targets.map(({ key, ctx }) =>
    createQueryResource(
      query,
      (text, signal) =>
        ctx.sdk.api.experimental.search.messages({ query: text, limit: MESSAGE_LIMIT }, { signal }).then((hits) =>
          hits.map(
            (hit): SpotlightItem => ({
              id: `message:${key}:${hit.messageID}`,
              type: "message",
              category: language.t("spotlight.group.messages"),
              title: hit.sessionTitle || language.t("command.session.new"),
              snippet: hit.snippet,
              meta: getRelativeTime(new Date(hit.time).toISOString(), language.t),
              server: key,
              sessionID: hit.sessionID,
              directory: hit.directory,
              archived: hit.archived,
            }),
          ),
        ),
    ),
  )

  const knowledge = targets.map(({ key, ctx }) =>
    createQueryResource(
      query,
      (text, signal) =>
        ctx.sdk.api.experimental["server.knowledge"]
          .search({ query: text, limit: KNOWLEDGE_LIMIT }, { signal })
          .then((hits) =>
            hits.map(
              (hit): SpotlightItem => ({
                id: `knowledge:${key}:${hit.libraryID}:${hit.path}:${hit.ordinal}`,
                type: "knowledge",
                category: language.t("spotlight.group.knowledge"),
                title: hit.name || hit.path,
                snippet: hit.text,
                meta: hit.libraryName,
                libraryID: hit.libraryID,
              }),
            ),
          ),
    ),
  )

  // Files open in the side panel of the session on screen, so the group exists only while one is routed.
  const fileTarget = createMemo(() => {
    const session = attachment.current()

    if (!session) return

    const key = ServerConnection.Key.make(session.server.id)
    const ctx = global.serverCtx(key)

    if (!ctx) return

    return { key, ctx, directory: session.directory }
  })

  const files = createQueryResource(query, (text, signal) => {
    const target = fileTarget()

    if (!target) return Promise.resolve([])

    return target.ctx.sdk.api.file
      .find({ location: { directory: target.directory }, query: text, type: "file", limit: FILE_LIMIT }, { signal })
      .then((result) =>
        result.data.map(
          (entry): SpotlightItem => ({
            id: `file:${target.key}:${entry.path}`,
            type: "file",
            category: language.t("spotlight.group.files"),
            title: getFilename(entry.path),
            snippet: getDirectory(entry.path) || entry.path,
            path: entry.path,
            directory: target.directory,
            server: target.key,
          }),
        ),
      )
  })

  const fileItems = createMemo(() => {
    const target = fileTarget()

    if (!target || !query()) return []

    // A result fetched for another workspace stays out of the list while the next directory loads.
    return latest(files).flatMap((item) =>
      item.type === "file" && item.server === target.key && item.directory === target.directory ? [item] : [],
    )
  })

  // Plugin sources answer beside the app's own groups: each one searches its own content and opens its own result.
  const providers = createMemo(() =>
    host
      .items(SearchProvider)
      .slice()
      .sort((left, right) => (left.value.order ?? 0) - (right.value.order ?? 0)),
  )

  const pluginSearch = createQueryResource(
    createMemo(() => ({ text: query(), providers: providers() })),
    (input, signal) => {
      if (!input.text) return Promise.resolve([])

      return Promise.all(
        input.providers.map((item) =>
          Promise.resolve()
            .then(() => item.value.search({ query: input.text, signal }))
            .then((results) =>
              results.slice(0, PLUGIN_LIMIT).map(
                (result): SpotlightItem => ({
                  id: `plugin:${item.plugin}:${item.value.id}:${result.id}`,
                  type: "plugin",
                  category: item.value.title,
                  title: result.title,
                  snippet: result.description,
                  icon: result.icon ?? item.value.icon,
                  run: () => result.run(),
                }),
              ),
            )
            // One provider's failure drops only its own results from this query.
            .catch((): SpotlightItem[] => []),
        ),
      ).then((groups) => groups.flat())
    },
    (input) => !input.text,
  )

  const libraryItems = createMemo(() => {
    const text = query()

    if (!text) return []

    return libraries
      .libraries()
      .filter((library) => matches([library.name, library.summary, library.description], text))
      .map(
        (library): SpotlightItem => ({
          id: `library:${library.id}`,
          type: "library",
          category: language.t("spotlight.group.libraries"),
          title: library.name,
          snippet: library.summary || library.description,
          libraryID: library.id,
        }),
      )
  })

  const inboxItems = createMemo(() => {
    const text = query()

    if (!text) return []

    return inbox
      .items()
      .filter((item) => matches([item.title, item.summary, item.source.name], text))
      .map(
        (item): SpotlightItem => ({
          id: `inbox:${item.key}`,
          type: "inbox",
          category: language.t("spotlight.group.inbox"),
          title: item.title,
          snippet: item.summary,
          key: item.key,
        }),
      )
  })

  const scheduleItems = createMemo(() => {
    const text = query()

    if (!text) return []

    return scheduled
      .tasks()
      .filter((task) => matches([taskName(task, language), promptOf(task)], text))
      .map(
        (task): SpotlightItem => ({
          id: `schedule:${task.id}`,
          type: "schedule",
          category: language.t("spotlight.group.scheduled"),
          title: taskName(task, language),
          snippet: promptOf(task),
          taskID: task.id,
        }),
      )
  })

  const projectItems = createMemo(() => {
    const text = query()

    if (!text) return []

    return targets.flatMap(({ key, ctx, tag }) =>
      ctx.projects.list().flatMap((project): SpotlightItem[] => {
        if (!matches([project.name, project.worktree], text)) return []

        return [
          {
            id: `project:${key}:${project.worktree}`,
            type: "project",
            category: language.t("spotlight.group.projects"),
            title: displayName(project) || getFilename(project.worktree),
            snippet: project.worktree,
            meta: tag,
            server: key,
            directory: project.worktree,
          },
        ]
      }),
    )
  })

  const items = createMemo<SpotlightItem[]>(() => {
    const text = query()

    if (!text) return []

    const sessionItems = sessions
      .flatMap(({ loader, archived }) =>
        loader.items(text).flatMap((entry) => toSessionItem(entry, archived, language)),
      )
      .slice(0, SESSION_LIMIT)

    return [
      ...sessionItems,
      ...messages.flatMap(latest).slice(0, MESSAGE_LIMIT),
      ...fileItems().slice(0, FILE_LIMIT),
      ...knowledge.flatMap(latest).slice(0, KNOWLEDGE_LIMIT),
      ...libraryItems(),
      ...inboxItems(),
      ...scheduleItems(),
      ...projectItems(),
      ...latest(pluginSearch),
    ]
  })

  const loading = () =>
    messages.some((resource) => resource.loading) ||
    knowledge.some((resource) => resource.loading) ||
    files.loading ||
    pluginSearch.loading

  const openSession = (target: SessionTarget) => {
    const ctx = global.serverCtx(target.server)

    if (!ctx) return

    const open = () => {
      ctx.projects.touch(target.project?.worktree ?? target.directory)
      void startTransition(() => tabs.select(tabs.addSessionTab({ server: target.server, sessionId: target.sessionID })))
    }

    if (!target.archived) return open()

    // An archived Session rejoins the sidebar once it is active again.
    void ctx.sdk.api.session
      .update({ sessionID: target.sessionID, archived: false })
      .then(async () => {
        ctx.data.session.remember(await ctx.sdk.api.session.get({ sessionID: target.sessionID }))
        open()
      })
      .catch((cause) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        }),
      )
  }

  const open = (item: SpotlightItem) => {
    dialog.close()

    switch (item.type) {
      case "session":
      case "message":
        return openSession(item)
      case "file":
        return openFile(item.path)
      case "knowledge":
      case "library":
        layout.destination.knowledge.setLibrary(item.libraryID)

        return navigate("/knowledge")
      case "inbox":
        layout.destination.inbox.setSelected(item.key)

        return navigate("/inbox")
      case "schedule":
        layout.destination.scheduled.setSelected(item.taskID)

        return navigate("/scheduled")
      case "project":
        global.serverCtx(item.server)?.projects.touch(item.directory)
        layout.home.setSelection({ server: item.server, directory: item.directory })

        return navigate("/")
      case "plugin":
        // A provider's own result cannot break the dialog: report it like any other contribution failure.
        try {
          item.run()
        } catch (cause) {
          console.error("[plugin] search result", cause)
        }

        return
    }
  }

  const empty = () =>
    loading() ? (
      <SpotlightState icon={<Loader class="size-4" />} text={language.t("common.loading")} />
    ) : (
      <SpotlightState
        icon={<Icon name="magnifying-glass" class="size-4" />}
        text={language.t("spotlight.empty", { query: query() })}
      />
    )

  return (
    <Dialog class="spotlight" size="normal" fit>
      <div class="sr-only">
        <DialogTitle>{language.t("spotlight.search.placeholder")}</DialogTitle>
      </div>
      <DialogBody class="spotlight-body" flush>
        <SearchList
          query={store.query}
          onQuery={(text) => setStore("query", text)}
          placeholder={language.t("spotlight.search.placeholder")}
          open={!!query()}
          items={items()}
          key={(item) => item.id}
          section={(item) => item.category}
          header={(item) => item.category}
          empty={empty()}
          footer={<span>{language.t("spotlight.hint")}</span>}
          onSelect={open}
          onClose={() => dialog.close()}
          onKeyDown={(event) => {
            if (event.defaultPrevented || event.key !== "Escape") return
            event.preventDefault()
            dialog.close()
          }}
        >
          {(item, row) => <SpotlightRow row={row} item={item()} />}
        </SearchList>
      </DialogBody>
    </Dialog>
  )
}

function SpotlightRow(props: { row: SearchListRow; item: SpotlightItem }) {
  return (
    <button type="button" class="spotlight-row" {...props.row}>
      <Switch
        fallback={
          <>
            <span class="spotlight-row-icon" aria-hidden="true">
              <Icon name={iconOf(props.item)} />
            </span>
            <span class="spotlight-row-text">
              <span class="spotlight-row-title">
                <SearchHighlight text={props.item.title} />
              </span>
              <Show when={props.item.snippet}>
                {(snippet) => (
                  <span class="spotlight-row-snippet">
                    <SearchHighlight text={snippet()} />
                  </span>
                )}
              </Show>
            </span>
          </>
        }
      >
        <Match when={props.item.type === "file" ? props.item : undefined}>
          {(item) => (
            <>
              <FileIcon node={{ path: item().path, type: "file" }} class="spotlight-row-icon size-4" />
              <span class="spotlight-file-path" dir="ltr">
                <span class="spotlight-file-dir">
                  <SearchHighlight text={getDirectory(item().path)} />
                </span>
                <span class="spotlight-file-name">
                  <SearchHighlight text={getFilename(item().path)} />
                </span>
              </span>
            </>
          )}
        </Match>
      </Switch>
      <Show when={props.item.meta}>{(meta) => <span class="spotlight-row-meta">{meta()}</span>}</Show>
    </button>
  )
}

function SpotlightState(props: { icon: JSX.Element; text: string }) {
  return (
    <div class="spotlight-state">
      <span data-slot="spotlight-state-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span>{props.text}</span>
    </div>
  )
}

function toSessionItem(
  entry: CommandPaletteEntry,
  archived: boolean,
  language: ReturnType<typeof useLanguage>,
): SpotlightItem[] {
  if (!entry.server || !entry.sessionID || !entry.directory) return []

  return [
    {
      id: entry.id,
      type: "session",
      category: language.t("spotlight.group.sessions"),
      title: entry.title,
      snippet: entry.description,
      meta: archived
        ? language.t("spotlight.archived")
        : entry.updated
          ? getRelativeTime(new Date(entry.updated).toISOString(), language.t)
          : undefined,
      server: entry.server,
      sessionID: entry.sessionID,
      directory: entry.directory,
      project: entry.project,
      archived,
    },
  ]
}

function matches(values: Array<string | undefined>, query: string) {
  const needle = query.toLocaleLowerCase()

  return values.some((value) => value?.toLocaleLowerCase().includes(needle))
}

function promptOf(task: ScheduleInfo) {
  return task.action.type === "prompt" ? task.action.prompt : ""
}

function latest<T>(resource: Resource<T[]>): T[] {
  return resource.state === "ready" || resource.state === "refreshing" ? resource.latest : []
}

/** A plugin result carries its own icon; the app's own groups have one icon each. */
function iconOf(item: SpotlightItem): IconName {
  if (item.type === "plugin") return item.icon ?? "magnifying-glass"

  return ICONS[item.type]
}

/** One remote source: cancels the previous request and waits for a pause before asking the server again. */
function createQueryResource<S, T>(
  source: () => S,
  load: (value: S, signal: AbortSignal) => Promise<T[]>,
  skip: (value: S) => boolean = (value) => !value,
) {
  let abort: AbortController | undefined

  onCleanup(() => abort?.abort())

  const [result] = createResource<T[], S>(
    source,
    async (value, info) => {
      abort?.abort()
      const current = new AbortController()
      abort = current
      const previous = info.value ?? []

      await pause(current.signal)

      if (current.signal.aborted) return previous

      if (skip(value)) return []

      return load(value, current.signal).then(
        (items) => (current.signal.aborted ? previous : items),
        () => (current.signal.aborted ? previous : []),
      )
    },
    { initialValue: [] },
  )

  return result
}

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 120)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
