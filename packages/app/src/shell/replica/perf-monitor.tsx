import { createStore } from "solid-js/store"
import { onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Popover } from "@opencode/ui/popover"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useLayout } from "@/shell/state/layout"
import { showToast } from "@/shell/notifications/toast"
import { runAgentDiagnosis, type DiagnosisDepth } from "./diagnostics/export"
import { DiagnosticsDepth, DiagnosticsTimeline } from "./diagnostics/panel"
import { installStateSection } from "./diagnostics/state"
import { diagnostics, type DiagnosticsMetrics } from "@opencode/diagnostics"

// Dev-only instrumentation for the desktop window. The recorder lives in @opencode/diagnostics; this
// component shows the latest sample and offers the "Agent diagnosis" handoff.

const EMPTY: DiagnosticsMetrics = {
  fps: 0,
  frame: 0,
  p95: 0,
  slow: 0,
  stutters: 0,
  longTasks: 0,
  longTaskMax: 0,
  input: 0,
  cls: 0,
  lag: 0,
  heapUsed: 0,
  heapLimit: 0,
  nodes: 0,
  viewport: "",
  trend: [],
}

export function PerfMonitor() {
  const language = useLanguage()
  const platform = usePlatform()
  const global = useGlobal()
  const servers = useServers()
  const layout = useLayout()
  const navigate = useNavigate()

  const [panel, setPanel] = createStore<{ open: boolean; busy: boolean; depth: DiagnosisDepth }>({
    open: false,
    busy: false,
    depth: "hot",
  })

  const [metrics, setMetrics] = createStore({ ...EMPTY })
  const [capture, setCapture] = createStore({ events: 0, dropped: 0, seconds: 60 })

  onMount(() => {
    diagnostics.start()
    setMetrics({ ...diagnostics.metrics() })
    const size = diagnostics.size()
    setCapture({ events: size.events, dropped: size.dropped, seconds: size.seconds })

    const unsubscribe = diagnostics.subscribe((next) => {
      setMetrics({ ...next })
      const size = diagnostics.size()
      setCapture({ events: size.events, dropped: size.dropped, seconds: size.seconds })
    })

    onCleanup(unsubscribe)

    // The state section reads the live route and session through a getter, so installing it once is
    // enough: every dump sees the state at export time, and consecutive dumps can be diffed.
    const dispose = installStateSection(() => {
      const key = server()
      const ctx = key ? global.serverCtx(key) : undefined
      const route = layout.route()

      return {
        route,
        server: key,
        session: route.type === "session" ? ctx?.data.session.get(route.sessionId) : undefined,
        sessions: ctx?.data.session.list().length,
      }
    })

    onCleanup(dispose)
  })

  const tone = (value: number, good: number, warn: number) =>
    value <= good
      ? "var(--v2-state-fg-success)"
      : value <= warn
        ? "var(--v2-state-fg-warning)"
        : "var(--v2-state-fg-danger)"

  const fpsTone = () =>
    metrics.fps >= 55
      ? "var(--v2-state-fg-success)"
      : metrics.fps >= 40
        ? "var(--v2-state-fg-warning)"
        : "var(--v2-state-fg-danger)"

  const server = () => {
    const route = layout.route()

    if (route.type === "session") return route.server
    const connection = servers.visible.find((item) => servers.current(item)) ?? servers.visible[0]

    return connection ? ServerConnection.key(connection) : undefined
  }

  const routeLabel = () => {
    const route = layout.route()

    return route.type === "session" ? `session:${route.sessionId}` : route.type
  }

  const diagnose = () => {
    if (panel.busy) return
    const key = server()
    const ctx = key ? global.serverCtx(key) : undefined

    if (!key || !ctx) {
      showToast({ title: language.t("perf.monitor.failed"), description: language.t("perf.monitor.noServer") })

      return
    }

    const route = layout.route()

    const session =
      route.type === "session"
        ? ((current) => (current ? { id: current.id, location: current.location } : undefined))(
            ctx.data.session.get(route.sessionId),
          )
        : undefined

    const time = new Date().toLocaleTimeString(language.locale(), { hour: "2-digit", minute: "2-digit" })

    setPanel("busy", true)
    runAgentDiagnosis({
      platform,
      ctx,
      server: key,
      session,
      route: routeLabel(),
      title: language.t("perf.monitor.diagnosisTitle", { time }),
      depth: panel.depth,
      navigate: (href) => navigate(href),
    })
      .then(() => setPanel("open", false))
      .catch((error) =>
        showToast({
          title: language.t("perf.monitor.failed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => setPanel("busy", false))
  }

  const triggerProps: ComponentProps<"button"> & {
    "data-replica-control": string
    "data-ui": string
    "data-diagnostics-ignore": string
  } = {
    type: "button",
    "data-replica-control": "",
    "data-ui": "perf-monitor-trigger",
    "data-diagnostics-ignore": "",
    "aria-label": language.t("perf.monitor.open"),
    class:
      "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-4 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-selected)] hover:text-[var(--color-text-main)] active:bg-[var(--color-selected)] focus-visible:outline-none",
  }

  return (
    <Popover
      open={panel.open}
      onOpenChange={(next) => setPanel("open", next)}
      placement="bottom-end"
      gutter={6}
      triggerAs="button"
      triggerProps={triggerProps}
      trigger={
        <>
          <span class="size-1.5 shrink-0 rounded-full" style={{ "background-color": fpsTone() }} />
          <span class="shrink-0 tabular-nums">{metrics.fps}</span>
          <span class="shrink-0 text-[var(--color-text-tertiary)]">FPS</span>
        </>
      }
      class="w-[312px]"
    >
      <div data-diagnostics-ignore data-scrollable class="flex max-h-[calc(100vh-96px)] flex-col gap-2 overflow-y-auto">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[12px] leading-4 font-medium text-[var(--v2-text-text-base)]">
            {language.t("perf.monitor.title")}
          </span>
          <span class="text-[10px] leading-4 tracking-[0.08em] text-[var(--v2-text-text-faint)]">DEV</span>
        </div>

        <Sparkline values={metrics.trend} />

        <div class="flex flex-col gap-1">
          <Row label={language.t("perf.monitor.fps")} value={`${metrics.fps}`} color={fpsTone()} />
          <Row label={language.t("perf.monitor.frame")} value={`${metrics.frame} ms`} />
          <Row label={language.t("perf.monitor.p95")} value={`${metrics.p95} ms`} color={tone(metrics.p95, 20, 40)} />
          <Row label={language.t("perf.monitor.slow")} value={`${metrics.slow}%`} color={tone(metrics.slow, 5, 15)} />
          <Row
            label={language.t("perf.monitor.stutter")}
            value={`${metrics.stutters}`}
            color={tone(metrics.stutters, 0, 5)}
          />
          <Row
            label={language.t("perf.monitor.longTasks")}
            value={`${metrics.longTasks}`}
            color={tone(metrics.longTasks, 0, 5)}
          />
          <Row
            label={language.t("perf.monitor.longTaskMax")}
            value={`${metrics.longTaskMax} ms`}
            color={tone(metrics.longTaskMax, 50, 100)}
          />
          <Row
            label={language.t("perf.monitor.input")}
            value={`${metrics.input} ms`}
            color={tone(metrics.input, 100, 200)}
          />
          <Row
            label={language.t("perf.monitor.cls")}
            value={metrics.cls.toFixed(3)}
            color={tone(metrics.cls, 0.1, 0.25)}
          />
          <Row label={language.t("perf.monitor.lag")} value={`${metrics.lag} ms`} color={tone(metrics.lag, 20, 50)} />
          <Row
            label={language.t("perf.monitor.heap")}
            value={
              metrics.heapLimit > 0
                ? `${metrics.heapUsed.toFixed(1)} / ${metrics.heapLimit} MB`
                : language.t("perf.monitor.unavailable")
            }
          />
          <Row label={language.t("perf.monitor.nodes")} value={`${metrics.nodes}`} />
          <Row label={language.t("perf.monitor.viewport")} value={metrics.viewport} />
        </div>

        <div class="flex items-baseline justify-between gap-2 text-[10px] leading-4 text-[var(--v2-text-text-faint)]">
          <span>{language.t("perf.monitor.buffer", { seconds: capture.seconds })}</span>
          <span class="tabular-nums">
            {capture.events}
            <Show when={capture.dropped > 0}>
              {" · "}
              {language.t("perf.monitor.bufferDropped", { count: capture.dropped })}
            </Show>
          </span>
        </div>

        <div class="h-px shrink-0 bg-[var(--v2-border-border-muted)]" aria-hidden="true" />

        <DiagnosticsTimeline open={panel.open} />

        <div class="h-px shrink-0 bg-[var(--v2-border-border-muted)]" aria-hidden="true" />

        <DiagnosticsDepth value={panel.depth} onChange={(depth) => setPanel("depth", depth)} />

        <button
          type="button"
          data-replica-control
          disabled={panel.busy}
          onClick={diagnose}
          class="flex h-7 w-full shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--v2-background-bg-layer-03)] text-[11px] leading-4 text-[var(--v2-text-text-base)] transition-colors hover:bg-[var(--v2-background-bg-layer-04)] disabled:opacity-50"
        >
          {panel.busy ? language.t("perf.monitor.diagnosing") : language.t("perf.monitor.diagnose")}
        </button>
      </div>
    </Popover>
  )
}

function Row(props: { label: string; value: string; color?: string }) {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <span class="shrink-0 text-[11px] leading-4 text-[var(--v2-text-text-muted)]">{props.label}</span>
      <span
        class="min-w-0 truncate text-[11px] leading-4 tabular-nums text-[var(--v2-text-text-base)]"
        style={{ color: props.color }}
      >
        {props.value}
      </span>
    </div>
  )
}

function Sparkline(props: { values: number[] }) {
  const points = () => {
    const values = props.values

    if (values.length < 2) return ""
    const max = Math.max(60, ...values)

    return values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - (value / max) * 26}`).join(" ")
  }

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      class="h-7 w-full text-[var(--v2-text-text-faint)]"
      aria-hidden="true"
    >
      <polyline
        points={points()}
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  )
}
