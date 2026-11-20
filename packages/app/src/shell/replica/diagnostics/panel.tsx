import { createEffect, createMemo, For, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { diagnostics, summarize, type Finding, type FindingSeverity } from "@opencode/diagnostics"
import { useLanguage } from "@/runtime/i18n/language"
import { DIAGNOSIS_DEPTHS, type DiagnosisDepth } from "./export"

// The live half of the performance panel. It runs the same `summarize` the export uses against
// `diagnostics.preview()`, so the panel and the dump describe the same evidence the same way. The capture is
// only read while the popover is open and at most once per second: a closed panel costs nothing, and the
// preview itself (one copy of the hot events plus one sort) stays inside a frame.

const REFRESH_MS = 1_000

/** The panel never renders more than this many rows; the rest stay one export away. */
const VISIBLE_LIMIT = 8

const FILTERS = ["all", "error", "warn", "info"] as const

type SeverityFilter = (typeof FILTERS)[number]

/** Capture-relative milliseconds as `12.4s` / `-3.2s`, matching the one-decimal precision of `events.t`. */
function formatRelativeSeconds(deltaMs: number) {
  return `${(Math.round(deltaMs / 100) / 10).toFixed(1)}s`
}

/** Filtering only decides which rows render; the findings themselves are never rewritten. */
function filterTimeline(timeline: readonly Finding[], filter: SeverityFilter) {
  if (filter === "all") return timeline

  return timeline.filter((finding) => finding.severity === filter)
}

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  error: "var(--v2-state-fg-danger)",
  warn: "var(--v2-state-fg-warning)",
  info: "var(--v2-state-fg-info)",
}

/** `performance.stall` reads as `stall` in a row; the full kind stays in the row's title. */
function leafKind(kind: string) {
  const separator = kind.lastIndexOf(".")

  return separator === -1 ? kind : kind.slice(separator + 1)
}

export function DiagnosticsTimeline(props: { open: boolean }) {
  const language = useLanguage()
  const [view, setView] = createStore({
    timeline: [] as Finding[],
    generatedAt: "",
    seconds: diagnostics.size().seconds,
    filter: "all" as SeverityFilter,
    marked: false,
  })

  let refreshedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const refresh = () => {
    const preview = diagnostics.preview()
    const findings = summarize(preview)
    refreshedAt = performance.now()
    setView({ timeline: findings.timeline, generatedAt: preview.generatedAt, seconds: findings.window.seconds })
  }

  // Opening the panel is the only thing that starts the clock: the first frame after it opens already shows
  // evidence instead of an empty list that fills a second later.
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open) refresh()
      },
    ),
  )

  // `metrics` publishes every frame report (~250ms), which is too often for a summary over thousands of
  // events, so the listener only marks the second as spent and skips the rest.
  onMount(() =>
    onCleanup(
      diagnostics.subscribe(() => {
        if (!props.open) return
        if (performance.now() - refreshedAt < REFRESH_MS) return
        refresh()
      }),
    ),
  )

  onCleanup(() => clearTimeout(timer))

  const mark = () => {
    diagnostics.mark(language.t("perf.monitor.markLabel"))
    refresh()
    setView("marked", true)
    clearTimeout(timer)
    timer = setTimeout(() => setView("marked", false), 1_600)
  }

  const matched = createMemo(() => filterTimeline(view.timeline, view.filter))
  const visible = createMemo(() => matched().slice(0, VISIBLE_LIMIT))
  const hidden = createMemo(() => Math.max(0, matched().length - VISIBLE_LIMIT))
  const now = createMemo(() => Date.parse(view.generatedAt))

  const relative = (wall: number) => (Number.isFinite(now()) ? formatRelativeSeconds(wall - now()) : "")

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[12px] leading-5 font-medium text-[var(--v2-text-text-base)]">
          {language.t("perf.monitor.timeline.title")}
        </span>
        <button
          type="button"
          data-replica-control
          data-state={view.marked ? "marked" : undefined}
          onClick={mark}
          title={language.t("perf.monitor.markHint")}
          class="flex h-6 shrink-0 items-center rounded-full px-2 text-[12px] leading-4 text-[var(--v2-text-text-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)] hover:text-[var(--v2-text-text-base)] active:bg-[var(--v2-overlay-simple-overlay-pressed)] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--v2-focus-ring-color)] data-[state=marked]:text-[var(--v2-state-fg-success)]"
        >
          {view.marked ? language.t("perf.monitor.marked") : language.t("perf.monitor.mark")}
        </button>
      </div>

      <SegmentedControl
        class="segmented-control-v2--full-width"
        value={view.filter}
        onChange={(next) => {
          const filter = FILTERS.find((item) => item === next)

          if (filter) setView("filter", filter)
        }}
        aria-label={language.t("perf.monitor.filter.label")}
      >
        <SegmentedControlItem value="all">{language.t("perf.monitor.filter.all")}</SegmentedControlItem>
        <SegmentedControlItem value="error">{language.t("perf.monitor.filter.error")}</SegmentedControlItem>
        <SegmentedControlItem value="warn">{language.t("perf.monitor.filter.warn")}</SegmentedControlItem>
        <SegmentedControlItem value="info">{language.t("perf.monitor.filter.info")}</SegmentedControlItem>
      </SegmentedControl>

      <Show
        when={visible().length > 0}
        fallback={
          <p class="m-0 px-2 py-1 text-[12px] leading-5 text-[var(--v2-text-text-faint)]">
            {view.filter === "all"
              ? language.t("perf.monitor.timeline.empty", { seconds: view.seconds })
              : language.t("perf.monitor.timeline.filtered")}
          </p>
        }
      >
        {/* At most `VISIBLE_LIMIT` rows render, so the list is exactly as tall as its evidence: no inner
            scrollbar to eat into the 20px rows, and the panel's own scroll handles a short window. */}
        <ul class="m-0 flex list-none flex-col p-0">
          <For each={visible()}>
            {(finding) => (
              <li class="flex h-5 shrink-0 items-center gap-1.5 px-2" title={finding.hint ?? finding.title}>
                <span
                  aria-hidden="true"
                  class="size-1.5 shrink-0 rounded-full"
                  style={{ "background-color": SEVERITY_COLOR[finding.severity] }}
                />
                <span class="w-10 shrink-0 text-[11px] leading-5 tabular-nums text-[var(--v2-text-text-faint)]">
                  {relative(finding.at.wall)}
                </span>
                <span class="min-w-0 flex-1 truncate text-[12px] leading-5 text-[var(--v2-text-text-base)]">
                  {finding.title}
                </span>
                <span
                  class="max-w-14 shrink-0 truncate text-right font-mono text-[11px] leading-5 text-[var(--v2-text-text-faint)]"
                  title={finding.kind}
                >
                  {leafKind(finding.kind)}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={hidden() > 0}>
        <p class="m-0 px-2 text-[12px] leading-5 text-[var(--v2-text-text-faint)]">
          {language.plural("perf.monitor.timeline.more", hidden())}
        </p>
      </Show>
    </div>
  )
}

/** How much retention travels with the export, and what that costs in file size. */
export function DiagnosticsDepth(props: { value: DiagnosisDepth; onChange: (value: DiagnosisDepth) => void }) {
  const language = useLanguage()

  const change = (next: string | null) => {
    const depth = DIAGNOSIS_DEPTHS.find((item) => item === next)

    if (depth) props.onChange(depth)
  }

  const hint = () => {
    if (props.value === "warm") return language.t("perf.monitor.depth.warmHint")
    if (props.value === "cold") return language.t("perf.monitor.depth.coldHint")

    return language.t("perf.monitor.depth.hotHint")
  }

  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-[12px] leading-5 font-medium text-[var(--v2-text-text-base)]">
        {language.t("perf.monitor.depth.title")}
      </span>
      <SegmentedControl
        class="segmented-control-v2--full-width"
        value={props.value}
        onChange={change}
        aria-label={language.t("perf.monitor.depth.label")}
      >
        <SegmentedControlItem value="hot">{language.t("perf.monitor.depth.hot")}</SegmentedControlItem>
        <SegmentedControlItem value="warm">{language.t("perf.monitor.depth.warm")}</SegmentedControlItem>
        <SegmentedControlItem value="cold">{language.t("perf.monitor.depth.cold")}</SegmentedControlItem>
      </SegmentedControl>
      <span class="text-[12px] leading-5 text-[var(--v2-text-text-faint)]">{hint()}</span>
    </div>
  )
}
