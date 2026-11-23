import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { Memory } from "@opencode/schema/memory"
import type definition from "./index"

type Scope = Memory.Scope
type Entry = Memory.Entry
type EmptyIcon = "brain" | "outline-brain" | "magnifying-glass" | "warning"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return

  /** The app's own server carries the plugin and its storage; a remote server has its own memories. */
  const server = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((item) => item?.builtin || item?.local)
  const rpc = () => server()?.client.rpc(Memory.Definition)

  const [global, setGlobal] = createSignal<readonly Entry[]>([])
  const [project, setProject] = createSignal<readonly Entry[]>([])
  const [selected, setSelected] = createSignal<string | null>(null)
  const [query, setQuery] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal(false)

  const projects = createMemo(() => server()?.data.project.list() ?? [])
  const currentProject = createMemo(() => projects().find((item) => item.id === selected()))

  /** The routed session's project first, else the project used most recently. */
  createEffect(() => {
    const available = projects()
    if (available.length === 0) return setSelected(null)
    const routed = ctx.sessions.current()?.project?.id
    setSelected((previous) =>
      previous !== null && available.some((item) => item.id === previous)
        ? previous
        : (available.find((item) => item.id === routed)?.id ?? available[0]!.id),
    )
  })

  createEffect(() => {
    const connected = server()
    if (connected && connected.connected) void connected.data.project.sync().catch(() => undefined)
  })

  // A settings page can open before the server syncs its projects; `projects()` re-runs the load when it does.
  let generation = 0
  const refresh = async () => {
    const client = rpc()
    if (!client) {
      setLoading(false)
      return
    }
    const ticket = ++generation
    setLoading(true)
    setError(false)
    try {
      const result = await client.list({ projectID: selected() })
      if (ticket !== generation) return
      setGlobal(result.global)
      setProject(result.project)
    } catch {
      if (ticket !== generation) return
      setError(true)
      setGlobal([])
      setProject([])
    } finally {
      if (ticket === generation) setLoading(false)
    }
  }

  createEffect(() => {
    selected()
    server()?.id
    projects()
    void refresh()
  })

  const hasQuery = () => query().trim().length > 0

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ""
    return new Intl.DateTimeFormat(ctx.locale.locale(), { year: "numeric", month: "short", day: "numeric" }).format(
      date,
    )
  }

  const describe = (entry: Entry) => {
    const tags = entry.tags.map((tag) => `#${tag}`).join("  ")
    const updated = ctx.t("updated", { date: formatDate(entry.updatedAt) })
    return [tags, updated].filter((part) => part.length > 0).join(" · ")
  }

  const visible = (entries: readonly Entry[]) => {
    const needle = query().trim().toLowerCase()
    if (needle.length === 0) return entries
    return entries.filter(
      (entry) =>
        entry.text.toLowerCase().includes(needle) || entry.tags.some((tag) => tag.toLowerCase().includes(needle)),
    )
  }

  const globalMatches = createMemo(() => visible(global()))
  const projectMatches = createMemo(() => visible(project()))
  const searchEmpty = () =>
    hasQuery() && !loading() && !error() && globalMatches().length === 0 && projectMatches().length === 0
  const sectionVisible = (matches: readonly Entry[]) => !hasQuery() || loading() || error() || matches.length > 0

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
    const [text, setText] = createSignal(props.entry?.text ?? "")
    const [tags, setTags] = createSignal(props.entry?.tags.join("，") ?? "")
    const [busy, setBusy] = createSignal(false)

    const scopeHint = () => {
      if (props.scope === "global") return ctx.t("editor.scope.global")
      const item = currentProject()
      return item ? ctx.t("editor.scope.project", { project: projectName(item) }) : ctx.t("project.hint")
    }

    const submit = async () => {
      const client = rpc()
      const value = text().trim()
      if (!client || value.length === 0 || busy()) return
      const projectID = props.scope === "project" ? selected() : null
      if (props.scope === "project" && projectID === null) return
      setBusy(true)
      try {
        const list = tags()
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
        if (props.entry) {
          await client.update({ scope: props.scope, projectID, id: props.entry.id, text: value, tags: list })
        } else {
          await client.save({ scope: props.scope, projectID, text: value, tags: list })
        }
        props.close()
        await refresh()
        ctx.toast.show({ title: ctx.t("saved"), variant: "success" })
      } catch (cause) {
        failure(cause)
      } finally {
        setBusy(false)
      }
    }

    return (
      <ctx.ui.Dialog
        title={props.entry ? ctx.t("edit") : ctx.t(props.scope === "global" ? "new.global" : "new.project")}
        footer={
          <>
            <ctx.ui.Button onClick={props.close}>{ctx.t("cancel")}</ctx.ui.Button>
            <ctx.ui.Button
              variant="contrast"
              busy={busy()}
              disabled={text().trim().length === 0}
              onClick={() => void submit()}
            >
              {ctx.t("save")}
            </ctx.ui.Button>
          </>
        }
      >
        <div class="flex flex-col gap-4">
          <p class="text-13-regular text-v2-text-text-muted">{scopeHint()}</p>
          <div class="flex flex-col gap-2">
            <span class="text-13-medium text-v2-text-text-base">{ctx.t("field.text")}</span>
            <ctx.ui.TextInput
              label={ctx.t("field.text")}
              placeholder={ctx.t("field.text.placeholder")}
              value={text()}
              onInput={setText}
              onSubmit={() => void submit()}
              size="large"
              autofocus
            />
            <span class="text-13-regular text-v2-text-text-muted">{ctx.t("field.text.hint")}</span>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-13-medium text-v2-text-text-base">{ctx.t("field.tags")}</span>
            <ctx.ui.TextInput
              label={ctx.t("field.tags")}
              placeholder={ctx.t("field.tags.placeholder")}
              value={tags()}
              onInput={setTags}
            />
            <span class="text-13-regular text-v2-text-text-muted">{ctx.t("field.tags.hint")}</span>
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
    const summary = entry.text.length > 72 ? `${entry.text.slice(0, 72).trimEnd()}…` : entry.text
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t("delete.title"),
      description: ctx.t("delete.description", { text: summary }),
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

  const Row = (props: { scope: Scope; entry: Entry }) => (
    <ctx.ui.SettingsRow
      id={`${props.scope}:${props.entry.id}`}
      title={<span class="line-clamp-3">{props.entry.text}</span>}
      description={describe(props.entry)}
    >
      <ctx.ui.Tooltip value={ctx.t("edit")}>
        <ctx.ui.IconButton
          icon="edit"
          size="small"
          label={ctx.t("edit")}
          onClick={() => openEditor(props.scope, props.entry)}
        />
      </ctx.ui.Tooltip>
      <ctx.ui.Tooltip value={ctx.t("delete")}>
        <ctx.ui.IconButton
          icon="outline-trash"
          size="small"
          label={ctx.t("delete")}
          onClick={() => void remove(props.scope, props.entry)}
        />
      </ctx.ui.Tooltip>
    </ctx.ui.SettingsRow>
  )

  const EmptyState = (props: { icon: EmptyIcon; title: string; hint: string; action?: JSX.Element }) => (
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
      fallback={
        <EmptyState
          icon={props.scope === "global" ? "brain" : "outline-brain"}
          title={props.empty}
          hint={props.hint}
          action={props.action}
        />
      }
    >
      <div data-component="settings-list">
        <For each={props.entries}>{(entry) => <Row scope={props.scope} entry={entry} />}</For>
      </div>
    </Show>
  )

  ctx.add(SettingsPage, {
    id: "memory",
    icon: "brain",
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
          <div class="flex items-center gap-1">
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
            <Show when={hasQuery()}>
              <ctx.ui.IconButton icon="close" label={ctx.t("search.clear")} onClick={() => setQuery("")} />
            </Show>
          </div>
        }
      >
        <Show
          when={server()}
          fallback={<EmptyState icon="warning" title={ctx.t("offline")} hint={ctx.t("offline.hint")} />}
        >
          <Show
            when={!searchEmpty()}
            fallback={
              <EmptyState
                icon="magnifying-glass"
                title={ctx.t("empty.search")}
                hint={ctx.t("empty.search.hint")}
                action={
                  <ctx.ui.Button variant="neutral" icon="close" onClick={() => setQuery("")}>
                    {ctx.t("search.clear")}
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
                    !loading() && !error() && !hasQuery() && globalMatches().length > 0
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
                          setSelected(value)
                        }}
                        options={projects().map((item) => ({ value: item.id, label: projectName(item) }))}
                        class="max-w-[220px]"
                      />
                      <Show when={!loading() && !error() && !hasQuery() && projectMatches().length > 0}>
                        {addButton("project", ctx.t("add"))}
                      </Show>
                    </Show>
                  }
                />
                <Show
                  when={selected() !== null}
                  fallback={
                    <EmptyState
                      icon="outline-brain"
                      title={ctx.t("project.none")}
                      hint={ctx.t("project.none.hint")}
                    />
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
          </Show>
        </Show>
      </ctx.ui.SettingsLayout>
    ),
  })
}

export default setup
