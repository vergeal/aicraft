import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { SettingsPage, Plugin } from "@opencode/plugin/gui"
import { MemoryContract } from "../src/contract.js"

type Scope = MemoryContract.Scope
type Entry = MemoryContract.Entry

const i18n = {
  en: {
    title: "Memory",
    description:
      "What the assistant remembers across sessions. Global memories apply in every project; project memories apply only in the project you pick.",
    search: "Search memories",
    global: "Global memories",
    project: "Project memories",
    "project.select": "Project",
    "project.none": "No project open",
    "project.none.hint": "Open a project to keep memories that apply only there.",
    "add.global": "Add global memory",
    "add.project": "Add project memory",
    "empty.global": "No global memories yet",
    "empty.global.hint": "Ask the assistant to remember something, or add one here.",
    "empty.project": "Nothing remembered for this project",
    "empty.project.hint": "Ask the assistant to remember something in a session here, or add one.",
    "empty.search": "No memories match",
    "empty.search.hint": "Try another word, or clear the search.",
    loading: "Loading memories…",
    offline: "Memories are unavailable while the app is not connected to its server.",
    edit: "Edit memory",
    "new.global": "New global memory",
    "new.project": "New project memory",
    "field.text": "Memory",
    "field.text.placeholder": "A fact or preference that stands on its own",
    "field.tags": "Tags",
    "field.tags.placeholder": "Separate tags with commas",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete memory",
    "delete.title": "Delete this memory?",
    "delete.description": "It stops appearing in new sessions. This cannot be undone.",
    saved: "Memory saved",
    deleted: "Memory deleted",
    failed: "Couldn't update memories",
    updated: "Updated {{date}}",
  },
  zh: {
    title: "记忆",
    description: "跨会话记住你的习惯和项目约定。全局记忆在所有项目中生效，项目记忆只在所选项目中生效。",
    search: "搜索记忆",
    global: "全局记忆",
    project: "项目记忆",
    "project.select": "项目",
    "project.none": "还没有打开的项目",
    "project.none.hint": "打开一个项目后，就能保存只在该项目生效的记忆。",
    "add.global": "添加全局记忆",
    "add.project": "添加项目记忆",
    "empty.global": "还没有全局记忆",
    "empty.global.hint": "对助手说「记住……」，或者在这里手动添加。",
    "empty.project": "这个项目还没有记忆",
    "empty.project.hint": "在会话里对助手说「记住……」，或者在这里添加。",
    "empty.search": "没有匹配的记忆",
    "empty.search.hint": "换个关键词，或者清空搜索。",
    loading: "正在加载记忆…",
    offline: "未连接到服务端，暂时无法管理记忆。",
    edit: "编辑记忆",
    "new.global": "新的全局记忆",
    "new.project": "新的项目记忆",
    "field.text": "记忆内容",
    "field.text.placeholder": "一句独立、可复述的事实或偏好",
    "field.tags": "标签",
    "field.tags.placeholder": "用逗号分隔标签",
    save: "保存",
    cancel: "取消",
    delete: "删除记忆",
    "delete.title": "删除这条记忆？",
    "delete.description": "删除后它不会再出现在新会话中，且无法恢复。",
    saved: "已保存记忆",
    deleted: "已删除记忆",
    failed: "操作失败",
    updated: "更新于 {{date}}",
  },
}

const setup: Plugin.Setup = (ctx) => {
  if (!ctx.desktop) return

  /** The app's own server carries the plugin and its storage; a remote server has its own memories. */
  const server = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((item) => item?.builtin || item?.local)
  const rpc = () => server()?.client.rpc(MemoryContract.Definition)

  const [global, setGlobal] = createSignal<readonly Entry[]>([])
  const [project, setProject] = createSignal<readonly Entry[]>([])
  const [selected, setSelected] = createSignal<string | null>(null)
  const [query, setQuery] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal(false)

  const projects = createMemo(() => server()?.data.project.list() ?? [])

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

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ""
    return new Intl.DateTimeFormat(ctx.locale.locale(), { year: "numeric", month: "short", day: "numeric" }).format(
      date,
    )
  }

  const describe = (entry: Entry) => {
    const tags = entry.tags.map((tag) => `#${tag}`).join(" ")
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
            <ctx.ui.Button variant="contrast" busy={busy()} disabled={text().trim().length === 0} onClick={() => void submit()}>
              {ctx.t("save")}
            </ctx.ui.Button>
          </>
        }
      >
        <div class="flex flex-col gap-3">
          <ctx.ui.TextInput
            label={ctx.t("field.text")}
            placeholder={ctx.t("field.text.placeholder")}
            value={text()}
            onInput={setText}
            onSubmit={() => void submit()}
            size="large"
            autofocus
          />
          <ctx.ui.TextInput
            label={ctx.t("field.tags")}
            placeholder={ctx.t("field.tags.placeholder")}
            value={tags()}
            onInput={setTags}
          />
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
      description: ctx.t("delete.description"),
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
    <ctx.ui.SettingsRow title={props.entry.text} description={describe(props.entry)}>
      <div class="flex items-center gap-1">
        <ctx.ui.IconButton icon="edit" size="small" label={ctx.t("edit")} onClick={() => openEditor(props.scope, props.entry)} />
        <ctx.ui.IconButton
          icon="outline-trash"
          size="small"
          label={ctx.t("delete")}
          onClick={() => void remove(props.scope, props.entry)}
        />
      </div>
    </ctx.ui.SettingsRow>
  )

  const Empty = (props: { title: string; hint: string }) => (
    <ctx.ui.SettingsRow title={props.title} description={props.hint} />
  )

  const addButton = (scope: Scope) => (
    <ctx.ui.Button
      variant="ghost"
      size="small"
      icon="plus"
      disabled={scope === "project" && selected() === null}
      onClick={() => openEditor(scope)}
    >
      {ctx.t(scope === "global" ? "add.global" : "add.project")}
    </ctx.ui.Button>
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
          <ctx.ui.TextInput
            type="search"
            label={ctx.t("search")}
            placeholder={ctx.t("search")}
            value={query()}
            onInput={setQuery}
          />
        }
      >
        <Show
          when={server()}
          fallback={
            <ctx.ui.SettingsSection>
              <Empty title={ctx.t("offline")} hint={ctx.t("description")} />
            </ctx.ui.SettingsSection>
          }
        >
          <ctx.ui.SettingsSection title={ctx.t("global")} footer={addButton("global")}>
            <Show
              when={!loading() || global().length > 0}
              fallback={<Empty title={ctx.t("loading")} hint={ctx.t("empty.global.hint")} />}
            >
              <For
                each={visible(global())}
                fallback={
                  <Empty
                    title={ctx.t(error() ? "offline" : global().length === 0 ? "empty.global" : "empty.search")}
                    hint={ctx.t(global().length === 0 ? "empty.global.hint" : "empty.search.hint")}
                  />
                }
              >
                {(entry) => <Row scope="global" entry={entry} />}
              </For>
            </Show>
          </ctx.ui.SettingsSection>

          <ctx.ui.SettingsSection title={ctx.t("project")} footer={addButton("project")}>
            <Show
              when={projects().length > 0}
              fallback={<Empty title={ctx.t("project.none")} hint={ctx.t("project.none.hint")} />}
            >
              <ctx.ui.SettingsRow title={ctx.t("project.select")}>
                <ctx.ui.Select
                  label={ctx.t("project.select")}
                  value={selected() ?? undefined}
                  onChange={(value) => setSelected(value)}
                  options={projects().map((item) => ({ value: item.id, label: projectName(item) }))}
                />
              </ctx.ui.SettingsRow>
              <Show
                when={!loading() || project().length > 0}
                fallback={<Empty title={ctx.t("loading")} hint={ctx.t("empty.project.hint")} />}
              >
                <For
                  each={visible(project())}
                  fallback={
                    <Empty
                      title={ctx.t(error() ? "offline" : project().length === 0 ? "empty.project" : "empty.search")}
                      hint={ctx.t(project().length === 0 ? "empty.project.hint" : "empty.search.hint")}
                    />
                  }
                >
                  {(entry) => <Row scope="project" entry={entry} />}
                </For>
              </Show>
            </Show>
          </ctx.ui.SettingsSection>
        </Show>
      </ctx.ui.SettingsLayout>
    ),
  })
}

export default Plugin.define({ setup, i18n })
