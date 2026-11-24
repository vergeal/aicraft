import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useInbox } from "@/inbox/context"
import { inboxItemIcon } from "@/inbox/filters"
import type { InboxItem } from "@/inbox/model"
import { useLanguage } from "@/runtime/i18n/language"
import { useLayout } from "@/shell/state/layout"
import { getRelativeTime } from "@/shell/time"
import { createModuleSearch, ModuleGroup, ModuleHeader, ModulePage, ModuleSearch } from "@/shell/module-page"
import { InboxDetail } from "./detail"
import { PluginInboxDetail } from "./plugin-detail"

const STATUS_LABELS = {
  pending: "inbox.detail.status.pending",
  failed: "inbox.detail.status.failed",
  done: "inbox.detail.status.done",
} as const

/**
 * The inbox workspace: one fused page. State groups replace the filter row, and each card opens its decision and
 * actions in place instead of sending the user to a detail pane.
 */
export function InboxScreen() {
  const language = useLanguage()
  const navigate = useNavigate()
  const inbox = useInbox()
  const layout = useLayout()
  const search = createModuleSearch()
  const [doneCollapsed, setDoneCollapsed] = createSignal(false)

  const expanded = () => layout.destination.inbox.selected()

  const toggle = (item: InboxItem) => {
    const current = expanded()

    layout.destination.inbox.setSelected(current === item.key ? undefined : item.key)
    if (current !== item.key) inbox.markSeen(item)
  }

  const needle = () => search.query().trim().toLocaleLowerCase()

  const matches = (item: InboxItem) => {
    if (!needle()) return true

    return `${item.title}\n${item.summary}\n${item.source.name ?? ""}`.toLocaleLowerCase().includes(needle())
  }

  const pending = createMemo(() =>
    inbox
      .items()
      .filter((item) => item.status !== "done")
      .filter(matches),
  )
  const done = createMemo(() =>
    inbox
      .items()
      .filter((item) => item.status === "done")
      .filter(matches),
  )
  const unread = createMemo(() => inbox.items().filter((item) => inbox.unread(item)).length)
  const results = createMemo(() => [...pending(), ...done()])

  const follow = (item: InboxItem) => {
    switch (item.source.type) {
      case "session":
        inbox.openSession(item)
        break
      case "schedule":
        navigate("/scheduled")
        break
      case "knowledge":
        navigate("/knowledge")
        break
    }
  }

  const card = (item: InboxItem) => (
    <article class="module-card" data-open={expanded() === item.key ? "" : undefined}>
      <button
        type="button"
        class="module-card-head"
        aria-expanded={expanded() === item.key}
        onClick={() => toggle(item)}
      >
        <span class="module-card-glyph" data-tone={item.status}>
          <Icon name={inboxItemIcon(item)} size="small" />
        </span>
        <span class="module-card-title">
          <strong class="truncate">{item.title}</strong>
          <span class="module-card-meta">
            <Show when={item.source.name}>
              {(name) => (
                <>
                  <span class="truncate">{name()}</span>
                  <span class="sep" aria-hidden="true" />
                </>
              )}
            </Show>
            <span>{getRelativeTime(new Date(item.createdAt).toISOString(), language.t)}</span>
            <span class="sep" aria-hidden="true" />
            <span>{language.t(STATUS_LABELS[item.status])}</span>
            <Show when={inbox.unread(item)}>
              <span class="size-1.5 rounded-full bg-[var(--color-accent-blue)]" aria-hidden="true" />
            </Show>
          </span>
        </span>
        <Icon name="chevron-down" size="small" class="module-card-trail" />
      </button>

      <Show when={expanded() === item.key}>
        <div class="module-card-body">
          <Show
            when={item.source.type === "plugin"}
            fallback={<InboxDetail item={item} inbox={inbox} onOpen={() => follow(item)} />}
          >
            <Show
              when={inbox.pluginRecord(item)}
              fallback={
                <div class="flex items-center justify-center py-4">
                  <Loader class="text-[var(--color-icon-secondary)]" />
                </div>
              }
            >
              {(record) => <PluginInboxDetail record={record()} onDelete={() => inbox.remove(item)} />}
            </Show>
          </Show>
        </div>
      </Show>
    </article>
  )

  return (
    <ModulePage label={language.t("inbox.title")}>
      <ModuleHeader
        title={language.t("inbox.title")}
        count={
          pending().length > 0
            ? language.plural("inbox.pending", pending().length, { count: pending().length })
            : undefined
        }
        description={language.t("inbox.description")}
        actions={
          <>
            <Button
              size="small"
              variant="ghost-muted"
              icon="magnifying-glass"
              aria-label={language.t("replica.nav.search")}
              onClick={search.show}
            />
            <Button
              size="small"
              variant="ghost-muted"
              disabled={unread() === 0}
              onClick={() => inbox.markAllSeen(inbox.items())}
            >
              {language.t("replica.nav.markAllRead")}
            </Button>
          </>
        }
      />

      <Show
        when={inbox.items().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span class="flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-v2-background-bg-layer-02 text-v2-text-text-faint">
              <Icon name="notifications" />
            </span>
            <p class="text-[13px] leading-5 font-medium">{language.t("inbox.empty")}</p>
            <p class="max-w-80 text-[12px] leading-[var(--line-height-base)] text-v2-text-text-muted">
              {language.t("inbox.empty.hint")}
            </p>
          </div>
        }
      >
        <Show when={pending().length > 0}>
          <ModuleGroup title={language.t("inbox.filter.pending")} count={pending().length}>
            <For each={pending()}>{card}</For>
          </ModuleGroup>
        </Show>

        <Show when={done().length > 0}>
          <ModuleGroup
            title={language.t("inbox.filter.done")}
            count={done().length}
            collapsed={doneCollapsed()}
            onToggle={() => setDoneCollapsed(!doneCollapsed())}
          >
            <For each={done()}>{card}</For>
          </ModuleGroup>
        </Show>
      </Show>

      <ModuleSearch
        state={search}
        label={language.t("replica.nav.search")}
        placeholder={language.t("inbox.search.placeholder")}
        hint={
          needle()
            ? results().length
              ? language.plural("inbox.search.results", results().length, { count: results().length })
              : undefined
            : undefined
        }
      >
        <Show
          when={results().length > 0}
          fallback={<p class="module-search-empty">{language.t("inbox.search.empty")}</p>}
        >
          <For each={results()}>
            {(item) => (
              <button
                type="button"
                class="module-search-hit"
                onClick={() => {
                  if (doneCollapsed() && item.status === "done") setDoneCollapsed(false)
                  layout.destination.inbox.setSelected(item.key)
                  inbox.markSeen(item)
                  search.close()
                }}
              >
                <Icon name={inboxItemIcon(item)} size="small" />
                <span class="module-search-hit-label">{item.title}</span>
                <span class="text-[12px] text-v2-text-text-faint">{language.t(STATUS_LABELS[item.status])}</span>
              </button>
            )}
          </For>
        </Show>
      </ModuleSearch>
    </ModulePage>
  )
}
