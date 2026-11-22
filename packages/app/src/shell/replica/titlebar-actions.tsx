import { createMemo, Show } from "solid-js"
import { lastAssistantWithUsage } from "@opencode/client/solid"
import { createCNY, flashCostBreakdown } from "@opencode/gui-plugins/context/cost"
import { Icon } from "@opencode/ui/icon"
import { ProgressCircle } from "@opencode/ui/progress-circle"
import { Tooltip } from "@opencode/ui/tooltip"
import { base64Encode } from "@opencode/util/encode"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { useServers } from "@/runtime/server/registry"
import { SessionRouteKey, SessionStateKey } from "@/runtime/server/scope"
import { useLayout } from "@/shell/state/layout"
import { sessionPaneTab } from "@/shell/state/session-tabs"
import { findSessionTab, useTabs } from "@/shell/tabs/tabs"
import { PerfMonitor } from "./perf-monitor"

const BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-icon-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-icon-primary)] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--color-icon-secondary)] disabled:opacity-40 disabled:pointer-events-none"

/**
 * The context ring, the review toggle and the FPS meter ride whichever head is over the window's trailing edge:
 * the workspace bar while the side panel is closed, and the panel's own head once it opens, so they never sit in
 * the empty strip beside the panel.
 */
export function ReplicaTitlebarActions(props: { placement: "workspace" | "panel"; fps?: boolean }) {
  const CONTEXT_PANEL = "context:main"
  const language = useLanguage()
  const layout = useLayout()
  const global = useGlobal()
  const servers = useServers()
  const tabs = useTabs()

  /** The layout key of the routed session, the one its side tabs are stored under. */
  const stateKey = () => {
    const route = layout.route()

    if (route.type !== "session") return
    const session = global.serverCtx(route.server)?.data.session.get(route.sessionId)

    if (!session) return

    return SessionStateKey.from(
      servers.scope(route.server),
      SessionRouteKey.fromRoute(base64Encode(session.location.directory), session.id),
    )
  }

  /** The open conversation's review panel, the side region the layout opened for this tab. */
  const reviewTab = () => {
    const route = layout.route()

    if (route.type !== "session") return

    return findSessionTab(tabs.store, route.server, route.sessionId)
  }

  const reviewOpen = () => {
    const tab = reviewTab()

    return tab ? tabs.region(tab, "side") : false
  }

  const toggleReview = () => {
    const tab = reviewTab()

    if (!tab) return
    tabs.setRegion(tab, "side", !tabs.region(tab, "side"))
  }

  // The ring, the token count and the spend are one control: clicking it opens the built-in context panel next
  // to the conversation, the same panel the plugin's own indicator opens.
  const openContext = () => {
    const key = stateKey()

    if (!key) return

    layout.panel.open(key, CONTEXT_PANEL)

    const tab = reviewTab()

    if (tab) tabs.setRegion(tab, "side", true)
  }

  /** True while the side region already shows the context page the ring would open. */
  const contextShown = () => {
    if (!reviewOpen()) return false
    const key = stateKey()

    if (!key) return false

    return sessionPaneTab(layout.panel.state(key), "side") === CONTEXT_PANEL
  }

  // Shown beside the ring the way the reference reads: 15万 in Chinese, 150K in English.
  const compact = createMemo(
    () => new Intl.NumberFormat(language.locale(), { notation: "compact", maximumFractionDigits: 1 }),
  )

  const cny = createMemo(() => createCNY(language.locale()))

  // Same accounting as the context panel: context after the last compaction, spend across the session family.
  const usage = () => {
    const route = layout.route()

    if (route.type !== "session") return
    const ctx = global.serverCtx(route.server)
    const session = ctx?.data.session.get(route.sessionId)

    if (!ctx || !session) return
    const message = lastAssistantWithUsage(ctx.data.session.message.list(session.id), session.revert?.messageID)

    if (!message) return

    const directory = session.location.directory

    const model = ctx.data.location.model
      .list(directory ? { directory } : undefined)
      ?.findLast(
        (item) =>
          item.providerID === message.model.providerID && item.id === message.model.id && item.status !== "deprecated",
      )

    // Context occupancy is the prompt side only: output and reasoning are already spent, not resident in the next
    // request. This is what the context panel and its progress ring measure.
    const tokens = message.tokens.input + message.tokens.cache.read + message.tokens.cache.write

    const family = ctx.data.session.family(session.id)

    const spend = flashCostBreakdown(
      session.parentID
        ? [session.tokens]
        : (family.length ? family : [session.id]).flatMap((id) => ctx.data.session.get(id)?.tokens ?? []),
    )

    return {
      tokens,
      cost: spend.total,
      usage: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : 0,
    }
  }

  return (
    <Show when={props.placement === "workspace" ? !reviewOpen() : reviewOpen()}>
      {/* Hidden while the panel already shows the context page: the chip would only re-select the tab on screen. */}
      <Show when={contextShown() ? undefined : usage()}>
        {(value) => (
          <Tooltip
            placement="bottom"
            value={
              <div class="flex flex-col gap-0.5 text-start">
                <span>
                  {language.t("replica.context.tokens")}: {value().tokens.toLocaleString(language.locale())}
                </span>
                <span>
                  {language.t("replica.context.cost")}: {cny()(value().cost)}
                </span>
                <span>
                  {language.t("replica.context.usage")}: {value().usage}%
                </span>
              </div>
            }
          >
            <button
              type="button"
              data-ui="titlebar-context"
              data-replica-control
              data-session-only
              aria-label={language.t("replica.context.open")}
              class="flex h-6 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-[12px] leading-4 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-selected)] hover:text-[var(--color-text-main)] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--color-border)]"
              onClick={openContext}
            >
              <ProgressCircle
                data-ui="titlebar-context-progress"
                appearance="indicator"
                size={14}
                strokeWidth={2}
                percentage={value().usage}
                style={{
                  "--progress-circle-background": "var(--color-border)",
                  "--progress-circle-progress": "var(--color-icon-secondary)",
                }}
              />
              <span data-ui="titlebar-context-tokens" class="shrink-0 tabular-nums">
                {compact().format(value().tokens)}
              </span>
              <span class="shrink-0 tabular-nums text-[var(--color-text-tertiary)]">{cny()(value().cost)}</span>
            </button>
          </Tooltip>
        )}
      </Show>
      <Show when={reviewTab()}>
        <Tooltip placement="bottom" value={language.t("command.review.toggle")}>
          <button
            type="button"
            data-session-only
            data-replica-control
            data-ui="titlebar-review"
            data-slot="session-review-toggle"
            class={BUTTON}
            aria-label={language.t("command.review.toggle")}
            aria-expanded={reviewOpen()}
            aria-controls="review-panel"
            onClick={toggleReview}
          >
            <Icon name={reviewOpen() ? "layout-right-full" : "layout-right"} size="small" />
          </button>
        </Tooltip>
      </Show>
      <Show when={import.meta.env.DEV && props.fps !== false}>
        <PerfMonitor />
      </Show>
    </Show>
  )
}
