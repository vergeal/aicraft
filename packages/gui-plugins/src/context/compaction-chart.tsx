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

/** One finished step's prompt side; `afterCompaction` marks the first step a completed compaction precedes. */
type Point = { readonly tokens: number; readonly afterCompaction: boolean }

const HEIGHT = 64

const PAD = 4

/** Initial plot width; the resize observer replaces it with the container's real one. */
const INITIAL_WIDTH = 552

export function CompactionChart(props: { session: MountedSession }) {
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

  // Same window as the header's counter and the panel's occupancy bar: after the last completed compaction and
  // before the undo boundary. An earlier compaction is history this chart does not re-draw.
  const points = createMemo<Point[]>(() => {
    const list = props.session.server.data.session.message.list(props.session.id)
    const boundary = props.session.server.data.session.get(props.session.id)?.revert?.messageID
    const end = boundary ? list.findIndex((message) => message.id === boundary) : list.length

    if (end === -1) return []

    const result: Point[] = []
    let afterCompaction = false

    for (const message of list.slice(0, end)) {
      if (message.type === "compaction" && message.status === "completed") {
        afterCompaction = true
        continue
      }

      if (message.type === "assistant" && message.tokens !== undefined) {
        result.push({
          tokens: message.tokens.input + message.tokens.cache.read + message.tokens.cache.write,
          afterCompaction,
        })
        afterCompaction = false
      }
    }

    return result
  })

  // The same model resolution as the occupancy bar: the catalog entry of the last reported model.
  const limit = createMemo(() => {
    const list = props.session.server.data.session.message.list(props.session.id)
    const boundary = props.session.server.data.session.get(props.session.id)?.revert?.messageID
    const last = lastAssistantWithUsage(list, boundary)

    return last ? catalogModel(props.session, last.model)?.model?.limit.context : undefined
  })

  const geometry = createMemo(() => {
    const values = points()
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
      marks: values.flatMap((point, index) => (point.afterCompaction && index > 0 ? [x(index)] : [])),
    }
  })

  onCleanup(() => width[1](INITIAL_WIDTH))

  return (
    <Show when={geometry()}>
      {(g) => (
        <div ref={plot} class="flex flex-col gap-1.5 pt-1">
          <div class="flex items-baseline gap-2 text-[11.5px] text-v2-text-text-faint">
            <span>{ctx.t("window.history")}</span>
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
                <line
                  x1={mark}
                  x2={mark}
                  y1={PAD - 2}
                  y2={HEIGHT - PAD + 2}
                  stroke="var(--v2-border-border-strong)"
                  stroke-width="1"
                  stroke-dasharray="2 2"
                />
              )}
            </For>
          </svg>
        </div>
      )}
    </Show>
  )
}
