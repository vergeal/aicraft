import { createSignal, For, Show, createMemo, onCleanup, onMount } from "solid-js"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { lastAssistantWithUsage } from "@aicraft/client/solid"
import { usePlugin, type MountedSession } from "@aicraft/aix/gui"
import { catalogModel } from "./catalog"

/**
 * The compaction sawtooth: the prompt size of every finished step against the model's context window, drawn since
 * the session's last undo boundary. A completed compaction is a vertical rule; the step right after one shows the
 * drop to summary plus recent text. The transcript pages, so the chart covers the loaded messages only.
 */

const HEIGHT = 64

const PAD = 4

/** Initial plot width; the resize observer replaces it with the container's real one. */
const INITIAL_WIDTH = 552

export function CompactionChart(props: {
  session: MountedSession
  /**
   * The whole Session's step series and turn count, read from the server aggregate. The chart used to
   * walk the loaded transcript, so it drew only the page a reader had scrolled to.
   */
  points: ReadonlyArray<{ readonly tokens: number; readonly afterCompaction: boolean }>
  /** Rules to draw, each with the turns the segment it closed had run for. */
  compactions: ReadonlyArray<{ readonly point: number; readonly turns: number }>
  turns: number
}) {
  const ctx = usePlugin()

  // The side panel is resizable, so the geometry follows the container's real width instead of a fixed viewBox
  // scale, which centers and letterboxes the line once the panel is wider or narrower than the fallback.
  let plot: HTMLDivElement | undefined
  const width = createSignal(INITIAL_WIDTH)

  onMount(() => {
    if (plot) width[1](plot.clientWidth)
  })

  createResizeObserver(
    () => plot,
    () => {
      if (plot) width[1](plot.clientWidth)
    },
  )

  // The same model resolution as the occupancy bar: the catalog entry of the last reported model.
  const limit = createMemo(() => {
    const list = props.session.server.data.session.message.list(props.session.id)
    const boundary = props.session.server.data.session.get(props.session.id)?.revert?.messageID
    const last = lastAssistantWithUsage(list, boundary)

    return last ? catalogModel(props.session, last.model)?.model?.limit.context : undefined
  })

  const geometry = createMemo(() => {
    const values = props.points
    const last = values.length - 1

    if (last < 1) return

    const full = width[0]()
    const ceiling = limit()

    const tokens = values.map((point) => point.tokens)
    // Without a catalog limit the fill level is unknown; scale to the data instead of a false occupancy.
    const span = ceiling ?? Math.max(Math.max(...tokens) - Math.min(...tokens), 1)
    const floor = ceiling ? 0 : Math.min(...tokens)

    const y = (value: number) => PAD + (1 - Math.min((value - floor) / span, 1)) * (HEIGHT - 2 * PAD)
    const x = (position: number) => (position / last) * (full - 2 * PAD) + PAD

    return {
      width: full,
      line: values.map((point, index) => `${x(index).toFixed(1)},${y(point.tokens).toFixed(1)}`).join(" "),
      // The server reports the rules separately: a boolean on each sampled point vanished whenever the
      // sample missed the step right after a compaction. Each rule carries the turns its segment ran for.
      marks: props.compactions
        .filter((compaction) => compaction.point > 0 && compaction.point <= last)
        .map((compaction) => ({ x: x(compaction.point), turns: compaction.turns })),
    }
  })

  onCleanup(() => width[1](INITIAL_WIDTH))

  return (
    <Show when={geometry()}>
      {(g) => (
        <div ref={plot} class="flex flex-col gap-1.5 pt-1">
          <div class="flex items-baseline gap-2 text-[11.5px] text-v2-text-text-faint">
            <span>{ctx.t("window.history")}</span>
            <span class="text-v2-text-text-muted">
              {ctx.t("window.sinceCompaction", { count: String(props.turns) })}
            </span>
            <span class="ms-auto">{ctx.t("window.historyNote")}</span>
          </div>
          <svg
            class="block w-full overflow-visible"
            height={HEIGHT}
            viewBox={`0 0 ${g().width} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ctx.t("window.historyAria")}
          >
            <polyline
              points={g().line}
              fill="none"
              stroke="var(--v2-background-bg-accent)"
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <For each={g().marks}>
              {(mark) => (
                <>
                  <line
                    x1={mark.x}
                    x2={mark.x}
                    y1={PAD - 2}
                    y2={HEIGHT - PAD + 2}
                    stroke="var(--v2-border-border-strong)"
                    stroke-width="1"
                    stroke-dasharray="2 2"
                  />
                  {/* A 1px rule is a hard hover target, so an invisible band carries the pointer. The hint
                      rides the band's own `<title>`: the Kobalte tooltip renders an HTML trigger, which an
                      SVG line inside a chart cannot host. */}
                  <line
                    x1={mark.x}
                    x2={mark.x}
                    y1={PAD - 2}
                    y2={HEIGHT - PAD + 2}
                    stroke="transparent"
                    stroke-width="9"
                    style={{ "pointer-events": "stroke", cursor: "help" }}
                  >
                    <title>{ctx.t("window.compactionRule", { count: String(mark.turns) })}</title>
                  </line>
                </>
              )}
            </For>
          </svg>
        </div>
      )}
    </Show>
  )
}
