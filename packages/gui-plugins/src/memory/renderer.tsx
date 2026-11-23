import { createMemo, createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { createKeyed, SearchProvider, SettingsPage, Style, type Plugin } from "@opencode/plugin/gui"
import { Memory } from "@opencode/schema/memory"
import type definition from "./index"
import styles from "./memory.css?inline"

type Scope = Memory.Scope

type Entry = Memory.Entry

/** One plugin's memories, as the server groups them. Plugin memories never join the user's own scopes. */
type PluginGroup = { plugin: string; entries: readonly Entry[] }

/** Matches the tools' own limits, so the editor cannot build an entry they would reject or truncate. */
const MAX_TEXT = 2_000

const MAX_TAGS = 8

const MAX_TAG_LENGTH = 30
/** Below this an entry fits the two clamped lines the row shows without a "show all" action. */

const CLAMP_AT = 96

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return

  ctx.add(Style, styles)

  /** The app's own server carries the plugin and its storage; a remote server has its own memories. */
  const server = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((item) => item?.builtin || item?.local)

  const rpc = () => server()?.client.rpc(Memory.Definition)

  const [global, setGlobal] = createSignal<readonly Entry[]>([])
  const [project, setProject] = createSignal<readonly Entry[]>([])
  const [pluginGroups, setPluginGroups] = createSignal<readonly PluginGroup[]>([])
  const [manualProject, setManualProject] = createSignal<string | null>(null)
  const [query, setQuery] = createSignal("")
  const [activeTag, setActiveTag] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal(false)

  const projects = createMemo(() => server()?.data.project.list() ?? [])

  /** The routed session's project first, else the project used most recently; a pick wins while it is still listed. */
  const selected = createMemo(() => {
    const available = projects()

    if (available.length === 0) return null
    const manual = manualProject()

    if (manual !== null && available.some((item) => item.id === manual)) return manual
    const routed = ctx.sessions.current()?.project?.id

    return available.find((item) => item.id === routed)?.id ?? available[0]!.id
  })

  const currentProject = createMemo(() => projects().find((item) => item.id === selected()))

  createKeyed(() => server()?.id, () => {
    const connected = server()

    if (connected?.connected) void connected.data.project.sync().catch(() => undefined)
  })

  // A settings page can open before the server syncs its projects; `projects()` re-runs the load when it does.
  let generation = 0

  const refresh = async () => {
    const client = rpc()

    if (!client) {
      setLoading(false)

      return
    }

    const projectID = selected()
    const ticket = ++generation
    setLoading(true)
    setError(false)

    try {
      const [result, plugins] = await Promise.all([client.list({ projectID }), client.plugins({})])

      if (ticket !== generation) return
      setGlobal(result.global)
      setProject(result.project)
      setPluginGroups(plugins.groups)
    } catch {
      if (ticket !== generation) return
      setError(true)
      setGlobal([])
      setProject([])
      setPluginGroups([])
    } finally {
      if (ticket === generation) setLoading(false)
    }
  }

  createKeyed(
    () => {
      const client = rpc()

      if (!client) return

      return { client, projectID: selected(), projects: projects().length }
    },
    () => void refresh(),
    {
      equals: (previous, next) =>
        previous?.client === next?.client &&
        previous?.projectID === next?.projectID &&
        previous?.projects === next?.projects,
    },
  )

  const hasQuery = () => query().trim().length > 0
  const filtering = () => hasQuery() || activeTag() !== null

  const formatDate = (iso: string) => {
    const date = new Date(iso)

    if (Number.isNaN(date.getTime())) return ""

    return new Intl.DateTimeFormat(ctx.locale.locale(), { year: "numeric", month: "short", day: "numeric" }).format(
      date,
    )
  }

  /** A memory reads by when it changed; an untouched one reads by when it was added. */
  const stamp = (entry: Entry) =>
    entry.createdAt === entry.updatedAt
      ? ctx.t("created", { date: formatDate(entry.createdAt) })
      : ctx.t("updated", { date: formatDate(entry.updatedAt) })

  const visible = (entries: readonly Entry[]) => {
    const needle = query().trim().toLowerCase()
    const tag = activeTag()?.toLowerCase() ?? null

    return entries.filter(
      (entry) =>
        (tag === null || entry.tags.some((item) => item.toLowerCase() === tag)) &&
        (needle.length === 0 ||
          entry.text.toLowerCase().includes(needle) ||
          entry.tags.some((item) => item.toLowerCase().includes(needle))),
    )
  }

  const globalMatches = createMemo(() => visible(global()))
  const projectMatches = createMemo(() => visible(project()))

  const pluginMatches = createMemo(() =>
    pluginGroups()
      .map((group) => ({ plugin: group.plugin, entries: visible(group.entries) }))
      .filter((group) => group.entries.length > 0),
  )

  const pluginCount = () => pluginMatches().reduce((sum, group) => sum + group.entries.length, 0)

  const searchEmpty = () =>
    filtering() &&
    !loading() &&
    !error() &&
    globalMatches().length === 0 &&
    projectMatches().length === 0 &&
    pluginMatches().length === 0

  const sectionVisible = (matches: readonly Entry[]) => !filtering() || loading() || error() || matches.length > 0
  const pluginsVisible = () => !filtering() || loading() || error() || pluginMatches().length > 0

  const clearFilters = () => {
    setQuery("")
    setActiveTag(null)
  }

  const toggleTag = (tag: string) => setActiveTag((current) => (current === tag ? null : tag))

  const projectName = (item: { name?: string; canonical: string }) => {
    if (item.name) return item.name
    const parts = item.canonical.split(/[\\/]/).filter((part) => part.length > 0)

    return parts.at(-1) ?? item.canonical
  }

  const failure = (cause: unknown) =>
    ctx.toast.show({
      title: ctx.t("failed"),
      description: cause instanceof Error ? cause.message : String(cause),
      variant: "error",
    })

  /** The new-or-edit dialog. Signals live in the component so the dialog's owner disposes them when it closes. */
  const Editor = (props: { scope: Scope; entry?: Entry; close: () => void }) => {
    const [scope, setScope] = createSignal<Scope>(props.scope)
    const [text, setText] = createSignal(props.entry?.text ?? "")
    const [tags, setTags] = createSignal<string[]>(props.entry ? [...props.entry.tags] : [])
    const [draft, setDraft] = createSignal("")
    const [tagError, setTagError] = createSignal<"long" | "max" | null>(null)
    const [busy, setBusy] = createSignal(false)
    let tagField: HTMLInputElement | undefined

    const overLimit = () => text().length > MAX_TEXT
    const count = () => `${text().length} / ${MAX_TEXT}`
    const canSave = () => text().trim().length > 0 && !overLimit() && !busy()

    const canPick = (value: Scope) => value === "global" || selected() !== null

    const tagMessage = () => {
      const problem = tagError()

      if (problem === "long") return ctx.t("field.tags.error.long")

      if (problem === "max" || tags().length >= MAX_TAGS) return ctx.t("field.tags.error.max")

      return ctx.t("field.tags.limit", { max: MAX_TAGS, length: MAX_TAG_LENGTH })
    }

    const scopeHint = () => {
      if (scope() === "global") return ctx.t("editor.scope.global")
      const item = currentProject()

      return item ? ctx.t("editor.scope.project", { project: projectName(item) }) : ctx.t("project.hint")
    }

    /** Adds one tag; false when it cannot be stored, with the reason left on the field. */
    const addTag = (raw: string) => {
      const value = raw.trim().replace(/^#/, "").trim()

      if (value.length === 0) return true

      if (value.length > MAX_TAG_LENGTH) {
        setTagError("long")

        return false
      }

      const current = tags()

      if (current.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
        setDraft("")
        setTagError(null)

        return true
      }

      if (current.length >= MAX_TAGS) {
        setTagError("max")

        return false
      }

      setTags([...current, value])
      setDraft("")
      setTagError(null)

      return true
    }

    const removeTag = (index: number) => setTags((current) => current.filter((_, at) => at !== index))

    const onTagKey = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
      if (event.isComposing) return
      const input = event.currentTarget

      if (event.key === "Enter" || event.key === "," || event.key === "，") {
        event.preventDefault()
        addTag(input.value)

        return
      }

      if (event.key === "Backspace" && input.value.length === 0 && tags().length > 0) {
        event.preventDefault()
        removeTag(tags().length - 1)
      }
    }

    const flushDraft = () => {
      const value = draft().trim()

      if (value.length === 0) return true

      return addTag(value)
    }

    const dirty = () => {
      const base = props.entry
      const value = text().trim()
      const pending = draft().trim().length > 0

      if (!base) return value.length > 0 || tags().length > 0 || pending

      return value !== base.text || tags().join("\u0000") !== base.tags.join("\u0000") || pending
    }

    const submit = async () => {
      const client = rpc()
      const value = text().trim()

      if (!client || busy() || value.length === 0 || value.length > MAX_TEXT) return

      if (!flushDraft()) return
      const projectID = scope() === "project" ? selected() : null

      if (scope() === "project" && projectID === null) return
      setBusy(true)

      try {
        if (props.entry) {
          await client.update({ scope: scope(), projectID, id: props.entry.id, text: value, tags: tags() })
          props.close()
          await refresh()
          ctx.toast.show({ title: ctx.t("saved"), variant: "success" })
        } else {
          const result = await client.save({ scope: scope(), projectID, text: value, tags: tags() })
          props.close()
          await refresh()
          ctx.toast.show({ title: ctx.t(result.duplicate ? "saved.duplicate" : "saved"), variant: "success" })
        }
      } catch (cause) {
        failure(cause)
      } finally {
        setBusy(false)
      }
    }

    const cancel = async () => {
      if (!dirty()) return props.close()

      const confirmed = await ctx.dialogs.confirm({
        title: ctx.t("discard.title"),
        description: ctx.t("discard.description"),
        confirm: ctx.t("discard.confirm"),
        cancel: ctx.t("cancel"),
        danger: true,
      })

      if (confirmed) props.close()
    }

    const onTextKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        void submit()
      }
    }

    return (
      <ctx.ui.Dialog
        title={props.entry ? ctx.t("edit") : ctx.t("new")}
        size="fit"
        footer={
          <>
            <ctx.ui.Button onClick={() => void cancel()}>{ctx.t("cancel")}</ctx.ui.Button>
            <ctx.ui.Button variant="contrast" busy={busy()} disabled={!canSave()} onClick={() => void submit()}>
              {ctx.t("save")}
            </ctx.ui.Button>
          </>
        }
      >
        <div class="memory-editor">
          <Show when={!props.entry} fallback={<p class="memory-editor-scope">{scopeHint()}</p>}>
            <div class="flex items-center justify-between gap-3">
              <span class="text-13-regular text-v2-text-text-muted">{scopeHint()}</span>
              <div class="memory-scope-switch">
                <For each={["global", "project"] as const}>
                  {(value) => (
                    <button
                      type="button"
                      aria-pressed={scope() === value}
                      disabled={!canPick(value)}
                      onClick={() => setScope(value)}
                    >
                      {ctx.t(value === "global" ? "scope.global" : "scope.project")}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="memory-field">
            <label class="memory-field-copy">
              <span class="memory-field-label">{ctx.t("field.text")}</span>
              <textarea
                ref={(element) => {
                  // The dialog mounts before the field is focusable; focus once it is in the document.
                  requestAnimationFrame(() => element.focus())
                }}
                class="memory-textarea"
                aria-invalid={overLimit()}
                placeholder={ctx.t("field.text.placeholder")}
                value={text()}
                rows={4}
                onInput={(event) => setText(event.currentTarget.value)}
                onKeyDown={onTextKey}
              />
            </label>
            <span class="memory-field-hint">
              <span>{ctx.t("field.text.hint")}</span>
              <span class="memory-field-counter" data-over={overLimit()}>
                {count()}
              </span>
            </span>
          </div>

          <div class="memory-field">
            <span class="memory-field-label">{ctx.t("field.tags")}</span>
            <div class="memory-tag-field" onClick={() => tagField?.focus()}>
              <For each={tags()}>
                {(tag, index) => (
                  <span class="memory-tag">
                    {tag}
                    <button
                      type="button"
                      class="memory-tag-remove"
                      aria-label={ctx.t("tag.remove", { tag })}
                      onClick={() => removeTag(index())}
                    >
                      <ctx.ui.Icon name="close" size="small" />
                    </button>
                  </span>
                )}
              </For>
              <Show when={tags().length < MAX_TAGS}>
                <input
                  ref={(element) => (tagField = element)}
                  class="memory-tag-input"
                  aria-label={ctx.t("field.tags")}
                  placeholder={ctx.t(!props.entry ? "field.tags.placeholder" : "field.tags.more")}
                  value={draft()}
                  onInput={(event) => {
                    setDraft(event.currentTarget.value)
                    setTagError(null)
                  }}
                  onKeyDown={onTagKey}
                />
              </Show>
            </div>
            <span class="memory-field-hint" data-invalid={tagError() !== null || tags().length >= MAX_TAGS}>
              <span>{tagMessage()}</span>
            </span>
          </div>
        </div>
      </ctx.ui.Dialog>
    )
  }

  const openEditor = (scope: Scope, entry?: Entry) => {
    if (scope === "project" && selected() === null) return
    ctx.dialogs.open((dialog) => <Editor scope={scope} {...(entry === undefined ? {} : { entry })} close={dialog.close} />)
  }

  const remove = async (scope: Scope, entry: Entry) => {
    const client = rpc()

    if (!client) return

    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t("delete.title"),
      description: ctx.t("delete.description", { text: summary(entry) }),
      confirm: ctx.t("delete"),
      cancel: ctx.t("cancel"),
      danger: true,
    })

    if (!confirmed) return

    try {
      await client.remove({
        scope,
        projectID: scope === "project" ? selected() : null,
        id: entry.id,
      })
      await refresh()
      ctx.toast.show({ title: ctx.t("deleted"), variant: "success" })
    } catch (cause) {
      failure(cause)
    }
  }

  const removePlugin = async (plugin: string, entry: Entry) => {
    const client = rpc()

    if (!client) return

    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t("delete.title"),
      description: ctx.t("delete.description", { text: summary(entry) }),
      confirm: ctx.t("delete"),
      cancel: ctx.t("cancel"),
      danger: true,
    })

    if (!confirmed) return

    try {
      await client.removePlugin({ plugin, id: entry.id })
      await refresh()
      ctx.toast.show({ title: ctx.t("deleted"), variant: "success" })
    } catch (cause) {
      failure(cause)
    }
  }

  const summary = (entry: Entry) =>
    entry.text.length > 72 ? `${entry.text.slice(0, 72).trimEnd()}…` : entry.text

  const Row = (props: { scope: Scope | "plugin"; plugin?: string; entry: Entry }) => {
    const [expanded, setExpanded] = createSignal(false)
    const long = () => props.entry.text.length > CLAMP_AT

    return (
      <ctx.ui.SettingsRow
        id={props.plugin ? `${props.plugin}:${props.entry.id}` : `${props.scope}:${props.entry.id}`}
        title={
          <Show
            when={long()}
            fallback={<span class="memory-entry-text">{props.entry.text}</span>}
          >
            <button
              type="button"
              class="memory-entry-text"
              data-clamped={!expanded()}
              aria-expanded={expanded()}
              onClick={() => setExpanded((value) => !value)}
            >
              {props.entry.text}
            </button>
          </Show>
        }
        description={
          <div class="memory-entry-meta">
            <Show when={props.entry.tags.length > 0}>
              <div class="memory-tags">
                <For each={props.entry.tags}>
                  {(tag) => (
                    <button
                      type="button"
                      class="memory-tag"
                      aria-pressed={activeTag() === tag}
                      aria-label={ctx.t("tag.filter", { tag })}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <span class="memory-entry-time">{stamp(props.entry)}</span>
          </div>
        }
      >
        <Show when={props.scope !== "plugin"}>
          <ctx.ui.Tooltip value={ctx.t("edit")}>
            <ctx.ui.IconButton
              icon="edit"
              size="small"
              label={ctx.t("edit")}
              onClick={() => {
                if (props.scope === "plugin") return
                openEditor(props.scope, props.entry)
              }}
            />
          </ctx.ui.Tooltip>
        </Show>
        <ctx.ui.Tooltip value={ctx.t("delete")}>
          <ctx.ui.IconButton
            icon="outline-trash"
            size="small"
            label={ctx.t("delete")}
            onClick={() => {
              if (props.scope === "plugin") {
                if (props.plugin) void removePlugin(props.plugin, props.entry)

                return
              }

              void remove(props.scope, props.entry)
            }}
          />
        </ctx.ui.Tooltip>
      </ctx.ui.SettingsRow>
    )
  }

  const EmptyState = (props: { icon: "memory" | "magnifying-glass" | "warning"; title: string; hint: string; action?: JSX.Element }) => (
    <div class="settings-project-empty-card">
      <ctx.ui.Icon name={props.icon} size="large" class="mb-1 !size-6 text-v2-icon-icon-muted" />
      <div class="text-13-medium text-v2-text-text-base">{props.title}</div>
      <div class="text-13-regular text-v2-text-text-muted">{props.hint}</div>
      <Show when={props.action}>
        <div class="mt-4">{props.action}</div>
      </Show>
    </div>
  )

  // The three list states share the empty card's height, so the page does not jump between loading, error and content.
  const Loading = () => (
    <div class="settings-project-empty-card">
      <ctx.ui.Loader size="small" />
      <div class="text-13-regular text-v2-text-text-muted">{ctx.t("loading")}</div>
    </div>
  )

  const ErrorState = () => (
    <EmptyState
      icon="warning"
      title={ctx.t("error.title")}
      hint={ctx.t("error.hint")}
      action={
        <ctx.ui.Button variant="neutral" icon="refresh" onClick={() => void refresh()}>
          {ctx.t("error.retry")}
        </ctx.ui.Button>
      }
    />
  )

  const addButton = (scope: Scope, label: string) => (
    <ctx.ui.Button
      variant="neutral"
      size="small"
      icon="plus"
      disabled={scope === "project" && selected() === null}
      onClick={() => openEditor(scope)}
    >
      {label}
    </ctx.ui.Button>
  )

  const SectionHead = (props: { title: string; count: number; actions?: JSX.Element }) => (
    <div class="flex items-center justify-between gap-3">
      <h3 class="settings-section-title">
        <span>{props.title}</span>
        <span class="settings-section-count">{props.count}</span>
      </h3>
      <Show when={props.actions}>
        <div class="flex shrink-0 items-center gap-2">{props.actions}</div>
      </Show>
    </div>
  )

  const Entries = (props: {
    scope: Scope
    entries: readonly Entry[]
    empty: string
    hint: string
    action: JSX.Element
  }) => (
    <Show
      when={props.entries.length > 0}
      fallback={<EmptyState icon="memory" title={props.empty} hint={props.hint} action={props.action} />}
    >
      <div data-component="settings-list">
        <For each={props.entries}>{(entry) => <Row scope={props.scope} entry={entry} />}</For>
      </div>
    </Show>
  )

  const SEARCH_LIMIT = 6

  const toSearchResult = (entry: Entry, scope: Scope, projectID: string | null) => ({
    id: entry.id,
    title: entry.text,
    description: [scope === "global" ? ctx.t("global") : ctx.t("project"), entry.tags.join(" · ")]
      .filter((part) => part.length > 0)
      .join(" · "),
    run() {
      // A project memory opens on its own project, so the page shows the row the user picked.
      if (projectID !== null) setManualProject(projectID)
      ctx.layout.settings("memory")
    },
  })

  ctx.add(SearchProvider, {
    id: "memories",
    icon: "memory",
    get title() {
      return ctx.t("search.title")
    },
    async search({ query, signal }) {
      const client = rpc()
      const projectID = selected()

      if (!client) return []

      const result = await client.list({ projectID }, { signal })
      const needle = query.toLocaleLowerCase()

      const matches = (entry: Entry) =>
        entry.text.toLocaleLowerCase().includes(needle) ||
        entry.tags.some((tag) => tag.toLocaleLowerCase().includes(needle))

      return [
        ...result.global.filter(matches).map((entry) => toSearchResult(entry, "global", null)),
        ...result.project.filter(matches).map((entry) => toSearchResult(entry, "project", projectID)),
      ].slice(0, SEARCH_LIMIT)
    },
  })

  ctx.add(SettingsPage, {
    id: "memory",
    icon: "memory",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [
        {
          id: "memory",
          title: ctx.t("title"),
          description: ctx.t("description"),
          keywords: "memory 记忆 remember 记住 长期记忆",
        },
      ]
    },
    render: () => (
      <ctx.ui.SettingsLayout
        title={ctx.t("title")}
        description={ctx.t("description")}
        actions={
          <div class="flex items-center gap-2">
            <Show when={activeTag() !== null}>
              <button type="button" class="memory-filter-chip" onClick={() => setActiveTag(null)}>
                <span>{ctx.t("filter.by", { tag: activeTag() ?? "" })}</span>
                <ctx.ui.Icon name="close" size="small" />
              </button>
            </Show>
            <div class="w-[220px]">
              <ctx.ui.TextInput
                type="search"
                label={ctx.t("search")}
                placeholder={ctx.t("search")}
                value={query()}
                onInput={setQuery}
                class="w-full"
              />
            </div>
            <Show when={filtering()}>
              <ctx.ui.IconButton icon="close" label={ctx.t("filter.clear")} onClick={clearFilters} />
            </Show>
          </div>
        }
      >
        <Show
          when={server()}
          fallback={<EmptyState icon="warning" title={ctx.t("offline")} hint={ctx.t("offline.hint")} />}
        >
          {/* Marks this page for its own scroll frame: the header stays put and only the lists scroll. */}
          <div class="memory-page">
          <Show
            when={!searchEmpty()}
            fallback={
              <EmptyState
                icon="magnifying-glass"
                title={ctx.t("empty.search")}
                hint={ctx.t("empty.search.hint")}
                action={
                  <ctx.ui.Button variant="neutral" icon="close" onClick={clearFilters}>
                    {ctx.t("filter.clear")}
                  </ctx.ui.Button>
                }
              />
            }
          >
            <Show when={sectionVisible(globalMatches())}>
              <section class="settings-section" aria-label={ctx.t("global")}>
                <SectionHead
                  title={ctx.t("global")}
                  count={globalMatches().length}
                  actions={
                    !loading() && !error() && !filtering() && globalMatches().length > 0
                      ? addButton("global", ctx.t("add"))
                      : undefined
                  }
                />
                <Show when={!loading() || global().length > 0} fallback={<Loading />}>
                  <Show when={!error()} fallback={<ErrorState />}>
                    <Entries
                      scope="global"
                      entries={globalMatches()}
                      empty={ctx.t("empty.global")}
                      hint={ctx.t("empty.global.hint")}
                      action={addButton("global", ctx.t("add.global"))}
                    />
                  </Show>
                </Show>
              </section>
            </Show>

            <Show when={sectionVisible(projectMatches())}>
              <section class="settings-section" aria-label={ctx.t("project")}>
                <SectionHead
                  title={ctx.t("project")}
                  count={projectMatches().length}
                  actions={
                    <Show when={selected() !== null}>
                      <ctx.ui.Select
                        label={ctx.t("project.select")}
                        value={selected() ?? undefined}
                        onChange={(value) => {
                          // Drop the previous project's rows before the new list arrives, so they never show under another project.
                          setProject([])
                          setManualProject(value)
                        }}
                        options={projects().map((item) => ({ value: item.id, label: projectName(item) }))}
                        class="max-w-[220px]"
                      />
                      <Show when={!loading() && !error() && !filtering() && projectMatches().length > 0}>
                        {addButton("project", ctx.t("add"))}
                      </Show>
                    </Show>
                  }
                />
                <Show
                  when={selected() !== null}
                  fallback={
                    <EmptyState icon="memory" title={ctx.t("project.none")} hint={ctx.t("project.none.hint")} />
                  }
                >
                  <Show when={!loading() || project().length > 0} fallback={<Loading />}>
                    <Show when={!error()} fallback={<ErrorState />}>
                      <Entries
                        scope="project"
                        entries={projectMatches()}
                        empty={ctx.t("empty.project")}
                        hint={ctx.t("empty.project.hint")}
                        action={addButton("project", ctx.t("add.project"))}
                      />
                    </Show>
                  </Show>
                </Show>
              </section>
            </Show>

            <Show when={pluginsVisible()}>
              <section class="settings-section" aria-label={ctx.t("plugin.title")}>
                <SectionHead title={ctx.t("plugin.title")} count={pluginCount()} />
                <p class="memory-plugin-hint">{ctx.t("plugin.hint")}</p>
                <Show when={!loading() || pluginGroups().length > 0} fallback={<Loading />}>
                  <Show when={!error()} fallback={<ErrorState />}>
                    <Show
                      when={pluginMatches().length > 0}
                      fallback={
                        <EmptyState
                          icon="memory"
                          title={ctx.t("plugin.empty")}
                          hint={ctx.t("plugin.empty.hint")}
                        />
                      }
                    >
                      <div class="memory-plugins">
                        <For each={pluginMatches()}>
                          {(group) => (
                            <div class="memory-plugin-group">
                              <div class="memory-plugin-head">
                                <span class="memory-plugin-name">{group.plugin}</span>
                                <span class="settings-section-count">{group.entries.length}</span>
                              </div>
                              <div data-component="settings-list">
                                <For each={group.entries}>
                                  {(entry) => <Row scope="plugin" plugin={group.plugin} entry={entry} />}
                                </For>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </Show>
              </section>
            </Show>
          </Show>
          </div>
        </Show>
      </ctx.ui.SettingsLayout>
    ),
  })
}

export default setup
