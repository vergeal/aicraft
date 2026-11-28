import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { usePlugin, type MountedSession } from "@aicraft/aix/gui"
import { useI18n } from "@aicraft/ui/context/i18n"
import { Icon } from "@aicraft/ui/icon"

/**
 * What the assembly endpoint reports. Kept structural instead of importing the generated client types:
 * the panel only reads these fields, and the endpoint is experimental (it may change shape).
 */
type Inspection = {
  readonly snapshot: {
    readonly epoch: number
    readonly prefixVersion: number
    readonly parentVersion: number | null
    readonly bumpReason: string
    readonly baselineEpoch: number
    readonly agentID: string
    readonly modelID: string
    readonly pendingAdvance: boolean
    readonly layers: ReadonlyArray<{
      readonly layer: string
      readonly kind: string
      readonly source: string
      readonly bytes: number
      readonly text: string
    }>
    readonly baseline: ReadonlyArray<{
      readonly layer: string
      readonly kind: string
      readonly source: string
      readonly bytes: number
      readonly text: string
    }>
    readonly tools: ReadonlyArray<{ readonly name: string; readonly bytes: number; readonly source: string }>
  } | null
  readonly lineage: ReadonlyArray<{
    readonly epoch: number
    readonly prefixVersion: number
    readonly parentVersion: number | null
    readonly bumpReason: string
    readonly created: number
  }>
  readonly history: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly started: number
    readonly messages: ReadonlyArray<{ readonly id: string; readonly type: string; readonly text: string }>
  }>
  readonly notice: ReadonlyArray<{
    readonly key: string
    readonly layer: string
    readonly text: string
    readonly bytes: number
  }>
  readonly dynamic: ReadonlyArray<{
    readonly layer: string
    readonly source: string
    readonly bytes: number
    readonly text: string
    /** The records behind this source, each named by its own id (a retrieved memory's `mem_*`). */
    readonly items?: ReadonlyArray<{ readonly name: string; readonly bytes: number; readonly text: string }>
  }>
}

/**
 * One row the panel lists inside a layer: what it is, where it came from, and the text it contributes.
 *
 * `name` is the message key for what this row is, and `type` is the machine identity behind it — an
 * instruction source key, a tool name, a part kind. Keeping them apart is what lets the panel read in
 * any locale without losing the identifier an operator needs to match a log or an error: a tool is
 * still `read`, a source is still `core/date`, and only the label changes.
 */
type Row = {
  /**
   * What the row is called. Either a message key resolved through `ctx.t`, or — for a row whose own
   * content is its best label, such as the prompt that opened a turn — the text itself, marked by
   * `label`. A key that resolves to itself reads as the key, so the two cases cannot share one field
   * without saying which is which.
   */
  readonly name: string
  readonly label?: "literal"
  /** Machine identity: the stable name a log, error or provider response would show. */
  readonly type: string
  readonly bytes: number
  /** The model-visible text. Empty when the layer reports only a size. */
  readonly text: string
  /**
   * The records this row's bytes are made of, such as the memories one retrieval picked. Each carries
   * its own id so a reader can name the exact row instead of only seeing that a block was injected.
   */
  readonly items?: ReadonlyArray<{ readonly name: string; readonly bytes: number; readonly text: string }>
}

/** How often a layer's bytes move: frozen inside an epoch, low-frequency, or per request. */
type Churn = "frozen" | "low" | "hot"

const LAYERS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"] as const

const sectionLabel = "text-[12px] font-[530] text-v2-text-text-muted"
const card = "rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-01"

const encoder = new TextEncoder()
const size = (text: string) => encoder.encode(text).length

/**
 * A row's visible label. `name` is a message key, so an untranslated source resolves to the key
 * itself — which read as `assembly.source.memory` and told the reader nothing. Fall back to the
 * machine identity instead: `memory` is at least the identifier the request audit reports, and it
 * sits beside the source column the operator is matching against.
 */
const label = (row: Row, t: (key: string) => string) => {
  if (row.label === "literal") return row.name
  const translated = t(row.name)

  return translated === row.name ? row.type : translated
}

/** Bytes as a short size, since every row here is prompt text. */
function bytes(value: number): string {
  if (value < 1024) return `${value} B`

  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`

  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

/** Mirrors the server's readable text for one durable message: the bytes the model reads. */
function liveText(message: { type: string; [key: string]: unknown }): string {
  if (message.type === "user" || message.type === "synthetic" || message.type === "skill" || message.type === "system")
    return String((message as { text?: string }).text ?? "")
  if (message.type === "shell") {
    const shell = message as { command?: string; output?: { output?: string } }
    return `The user ran the following shell command:\n\nCommand:\n${shell.command ?? ""}\n\nOutput:\n${shell.output?.output ?? ""}`
  }
  if (message.type === "compaction") {
    const compaction = message as { status?: string; summary?: string }
    return compaction.status === "completed" ? String(compaction.summary ?? "") : ""
  }
  if (message.type === "assistant") {
    const content = (message as { content?: ReadonlyArray<Record<string, unknown>> }).content ?? []
    return content
      .map((part) => {
        if (part.type === "tool") return toolText(part)
        if (part.type === "reasoning") return ""
        return String(part.text ?? "")
      })
      .filter((text) => text !== "")
      .join("\n\n")
  }
  return ""
}

/** One tool part as the model sees it: the call with its input, then the real result or error. */
function toolText(part: Record<string, unknown>): string {
  const state = (part.state ?? {}) as { status?: string; input?: unknown; content?: unknown; error?: { message?: string } }
  const call = `Tool call: ${String(part.name ?? "?")}\n${JSON.stringify(state.input ?? {}, null, 2)}`
  if (part.executed !== true) return call
  if (state.status === "completed") {
    const items = Array.isArray(state.content) ? (state.content as Array<Record<string, unknown>>) : []
    const content = items.map((item) => (item.type === "text" ? String(item.text ?? "") : `[${String(item.type)}]`)).join("\n")
    return `${call}\n\nTool result:\n${content}`
  }
  if (state.status === "error") return `${call}\n\nTool error:\n${state.error?.message ?? ""}`
  return call
}

export default function ContextAssembly(props: { session: MountedSession }) {
  const ctx = usePlugin()
  const i18n = useI18n()
  const [expandedRows, setExpandedRows] = createSignal(new Set<string>())
  const [expandedLayers, setExpandedLayers] = createSignal(new Set(["L1"]))
  // L3 can hold hundreds of turns; each layer shows a page at a time.
  const PAGE = 10
  const [pageSizes, setPageSizes] = createSignal(new Map<string, number>())

  // A completed compaction rebakes the baseline: the epoch advances and L1-L3 change wholesale. Keying
  // the read on that row makes the panel follow it instead of showing the pre-compaction snapshot until
  // the reader presses refresh. A manual advance also rebakes, but it writes only lineage and no
  // message, so there is nothing here to key on; that case still needs the refresh button.
  const rebaked = createMemo(() => {
    const id = props.session.id
    if (!id) return undefined

    const last = props.session.server.data.session.message.list(id).findLast((message) => message.type === "compaction")

    // The status is part of the marker, not just the id: a compaction keeps its row from queued to
    // completed, so the id alone would not fire when the baseline is actually rebaked.
    return last === undefined ? undefined : `${last.id}:${last.status}`
  })

  // The panel is read-only, so a failed or missing read leaves the section empty instead of failing the tab.
  const [inspection, { refetch }] = createResource(
    () => [props.session.id, rebaked()] as const,
    async ([sessionID]) => {
      if (!sessionID) return undefined

      try {
        return (await props.session.server.client.experimental.session.assembly({ sessionID })) as Inspection
      } catch {
        return undefined
      }
    },
  )

  const toggleRow = (key: string) =>
    setExpandedRows((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleLayer = (layer: string) =>
    setExpandedLayers((current) => {
      const next = new Set(current)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })

  // Turns come from the message store rather than the one-shot endpoint, so L3 entries appear as
  // messages arrive. Rows that produce no request content (idle, agent-switched, a background shell's
  // duplicate) are left out: the panel lists what the model reads.
  //
  // The store only holds the newest page (20 rows, or 40 under a wider preset), while a replay window
  // after a compaction is routinely larger. Reading the window from the endpoint's `history` keeps a
  // long session's L3 complete; the store is only a live tail layered on top of it.
  const liveTurns = createMemo(() => {
    const id = props.session.id
    if (!id) return []
    const all = props.session.server.data.session.message.list(id)
    // L3 is the replay window, not the archive: the next request starts at the newest compaction, so
    // everything before it is exactly the history that compaction replaced. Keeping it here made a
    // compaction look like it freed nothing.
    const start = all.findLastIndex((message) => message.type === "compaction" && message.status === "completed")
    const store = start === -1 ? all : all.slice(start + 1)
    // The endpoint groups the whole window server-side and reports the text the model reads; take it
    // when it reaches further back than the page the store loaded, and let store rows that arrived
    // after that read carry the live tail.
    const history = inspection()?.history ?? []
    const fromHistory = history.flatMap((turn) =>
      turn.messages.map((message) => ({ id: message.id, type: message.type, text: message.text })),
    )
    const known = new Set(fromHistory.map((message) => message.id))
    const messages =
      fromHistory.length > 0 && fromHistory.length > store.length
        ? [
            ...fromHistory,
            ...store
              .filter((message) => !known.has(message.id))
              .map((message) => ({ id: message.id, type: message.type, text: liveText(message) })),
          ]
        : store.map((message) => ({ id: message.id, type: message.type, text: liveText(message) }))
    // A live group per user message, mirroring the server's grouping so the two never disagree.
    return messages.reduce<
      Array<{ id: string; label: string; messages: Array<{ id: string; type: string; text: string }> }>
    >((groups, message) => {
      const entry = { id: message.id, type: message.type, text: message.text }
      if (message.type === "user") {
        groups.push({ id: message.id, label: entry.text, messages: [entry] })
        return groups
      }
      const current = groups.at(-1)
      if (!current) {
        groups.push({ id: message.id, label: entry.text, messages: [entry] })
        return groups
      }
      current.messages.push(entry)
      return groups
    }, [])
  })

  // One entry per layer, each with the rows that actually contribute to the request.
  const layers = createMemo(() => {
    const data = inspection()
    const snapshot = data?.snapshot

    return LAYERS.map((layer): { layer: string; churn: Churn; rows: Row[] } => {
      // L1 is the whole frozen prefix: the snapshot's volatile parts plus the instruction baseline.
      // `parts` only holds the four sections with no other frozen home (agent, identity, project,
      // session), so listing it alone showed two rows while the request sent 27 KB — and made a
      // compaction, which rebakes the baseline, look like L1 had not moved at all.
      if (layer === "L1")
        return {
          layer,
          churn: "frozen" as const,
          rows: [
            ...(snapshot?.layers ?? []).map((part) => ({
              name: `assembly.kind.${part.kind}`,
              type: part.source,
              bytes: part.bytes,
              text: part.text,
            })),
            ...(snapshot?.baseline ?? [])
              .filter((entry) => entry.layer === "L1")
              .map((entry) => ({
                name: `assembly.source.${entry.source}`,
                type: entry.source,
                bytes: entry.bytes,
                text: entry.text,
              })),
            // Fixed harness text the request injects at assembly time (the memory save rules) has no
            // snapshot entry, so the audit is the only place it appears. It is L1 like the rest of the
            // frozen prefix, and leaving it out here dropped it from the panel entirely.
            ...(data?.dynamic ?? [])
              .filter((entry) => entry.layer === "L1")
              .map((entry) => ({
                name: `assembly.source.${entry.source}`,
                type: entry.source,
                bytes: entry.bytes,
                text: entry.text,
                items: entry.items,
              })),
          ],
        }

      // The tool declaration's schema lives in the request, not in a system part, so the panel shows
      // the advertised name and its schema size instead of text it cannot show verbatim.
      if (layer === "L2")
        return {
          layer,
          churn: "frozen" as const,
          rows: [
            ...(snapshot?.tools ?? []).map((tool) => ({
              name: `assembly.tool.${tool.name}`,
              type: tool.name,
              bytes: tool.bytes,
              text: "",
            })),
            // The codemode catalog is declared L2 but is instruction text, not a tool declaration, so
            // it arrives in the baseline rather than in the tool set.
            ...(snapshot?.baseline ?? [])
              .filter((entry) => entry.layer === "L2")
              .map((entry) => ({
                name: `assembly.source.${entry.source}`,
                type: entry.source,
                bytes: entry.bytes,
                text: entry.text,
              })),
          ],
        }

      if (layer === "L3") {
        // Newest turn first, and rows that produce no request content are left out: this is the
        // transcript as the model reads it. The turns come from the live message store, so a new
        // message appears as it arrives instead of at the next manual refresh.
        const groups = liveTurns()

        return {
          layer,
          churn: "frozen" as const,
          rows: [...groups].reverse().map((group) => ({
            // A turn is identified by the prompt that opened it, not by a generic label: ten rows all
            // reading "Turn" tells a reader nothing, while the prompt text is what they are scanning
            // for. The message id stays on the right as the stable identifier.
            name: group.label.slice(0, 80) || ctx.t("assembly.turn"),
            label: "literal" as const,
            type: group.id,
            bytes: group.messages.reduce((sum, message) => sum + size(message.text), 0),
            text: group.messages.map((message) => `[${message.type}]\n${message.text}`).join("\n\n---\n\n"),
          })),
        }
      }

      // L4 and L5 are the low-frequency band: state claims and dynamic facts that settle rather
      // than stream. Their bytes come from the live instruction values, so a notice with content
      // shows its size instead of a placeholder zero.
      if (layer === "L4")
        return {
          layer,
          churn: "low" as const,
          rows: [
            // A pending declaration reads as an L4 row with the value the source holds now: the
            // key alone would say that something changed without saying what it changed to.
            ...(data?.notice ?? []).map((notice) => ({
              name: `assembly.source.${notice.key}`,
              type: notice.key,
              bytes: notice.bytes,
              text: notice.text,
            })),
            ...(data?.dynamic ?? [])
              .filter((entry) => entry.layer === "L4")
              .map((entry) => ({
                name: `assembly.source.${entry.source}`,
                type: entry.source,
                bytes: entry.bytes,
                text: entry.text,
              })),
          ],
        }

      if (layer === "L5")
        return {
          layer,
          churn: "low" as const,
          rows: (data?.dynamic ?? [])
            .filter((entry) => entry.layer === "L5")
            .map((entry) => ({
              name: `assembly.source.${entry.source}`,
              type: entry.source,
              bytes: entry.bytes,
              text: entry.text,
            })),
        }

      // L6 to L8 are the hot band: memory injection, the turn's own input, and tail notices, all
      // recomputed per request.
      return {
        layer,
        churn: "hot" as const,
        rows: (data?.dynamic ?? [])
          .filter((entry) => entry.layer === layer)
          .map((entry) => ({
            name: `assembly.source.${entry.source}`,
            type: entry.source,
            bytes: entry.bytes,
            text: entry.text,
            items: entry.items,
          })),
      }
    })
  })

  const totals = createMemo(() => {
    const all = layers().flatMap((entry) => entry.rows)

    return {
      frozen: layers()
        .filter((entry) => entry.churn === "frozen")
        .flatMap((entry) => entry.rows)
        .reduce((sum, row) => sum + row.bytes, 0),
      total: all.reduce((sum, row) => sum + row.bytes, 0),
    }
  })

  const rowKey = (layer: string, type: string) => `${layer}\u0000${type}`

  const pageSize = (layer: string) => pageSizes().get(layer) ?? PAGE
  const visibleRows = (layer: string, rows: readonly Row[]) => rows.slice(0, pageSize(layer))
  const growPage = (layer: string) =>
    setPageSizes((current) => new Map(current).set(layer, pageSize(layer) + PAGE))

  /** A collapsible row: the header always, its text when opened. */
  const RowView = (rowProps: { layer: string; row: Row; index: number }): JSX.Element => {
    const key = rowKey(rowProps.layer, rowProps.row.type)
    const open = () => expandedRows().has(key)
    const expandable = () => rowProps.row.text.length > 0

    return (
      <div class="flex flex-col" classList={{ "border-t border-v2-border-border-muted": rowProps.index > 0 }}>
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 text-start hover:bg-v2-overlay-simple-overlay-hover disabled:cursor-default"
          onClick={() => expandable() && toggleRow(key)}
          disabled={!expandable()}
          aria-expanded={expandable() ? open() : undefined}
        >
          <Show when={expandable()} fallback={<span class="w-3" />}>
            <Icon name="chevron-right" size="small" class="shrink-0 text-v2-text-text-faint" style={{ transform: open() ? "rotate(90deg)" : undefined }} />
          </Show>
          <span class="min-w-0 truncate text-[11.5px] text-v2-text-text-base">
            {label(rowProps.row, ctx.t)}
          </span>
          <span class="shrink-0 text-[10.5px] text-v2-text-text-faint">{rowProps.row.type}</span>
          <span class="ms-auto shrink-0 text-[11px] tabular-nums text-v2-text-text-faint">
            {bytes(rowProps.row.bytes)}
          </span>
        </button>
        <Show when={open()}>
          <div class="border-t border-v2-border-border-muted bg-v2-background-bg-base">
            {/* The records behind the row, named by their own id: a retrieved memory lists as its
                `mem_*` so the reader can match it against the memory tool's output and the store. */}
            <Show when={rowProps.row.items?.length ? rowProps.row.items : undefined}>
              {(items) => (
                <div class="flex flex-col divide-y divide-v2-border-border-muted">
                  <For each={items()}>
                    {(item) => (
                      <div class="flex flex-col gap-0.5 px-3 py-1.5">
                        <div class="flex items-center gap-2">
                          <span class="min-w-0 truncate font-mono text-[11px] text-v2-text-text-base">{item.name}</span>
                          <span class="ms-auto shrink-0 text-[11px] tabular-nums text-v2-text-text-faint">
                            {bytes(item.bytes)}
                          </span>
                        </div>
                        <pre class="max-h-[160px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-v2-text-text-muted select-text">
                          {item.text}
                        </pre>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </Show>
            <pre class="max-h-[280px] overflow-auto whitespace-pre-wrap break-words border-t border-v2-border-border-muted px-3 py-2 text-[11px] leading-[1.5] text-v2-text-text-muted select-text">
              {rowProps.row.text}
            </pre>
          </div>
        </Show>
      </div>
    )
  }

  return (
    <section class="flex flex-col gap-2.5">
      <div class="flex items-center gap-2">
        <div class={sectionLabel}>{ctx.t("assembly.title")}</div>
        <button
          type="button"
          class="ms-auto text-[11.5px] text-v2-text-text-accent hover:underline disabled:opacity-50"
          onClick={() => void refetch()}
          disabled={inspection.loading}
        >
          {inspection.loading ? ctx.t("assembly.loading") : ctx.t("assembly.refresh")}
        </button>
      </div>

      <Show
        when={inspection()?.snapshot}
        fallback={
          <div class={`${card} px-3 py-2.5 text-[12px] text-v2-text-text-faint`}>{ctx.t("assembly.noSnapshot")}</div>
        }
      >
        {(snapshot) => (
          <div class={`${card} flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-[12px]`}>
            <span class="text-v2-text-text-base">
              {ctx.t("assembly.epoch")} <span class="tabular-nums">{snapshot().epoch}</span>
            </span>
            <span class="text-v2-text-text-base">
              {ctx.t("assembly.version")} <span class="tabular-nums">v{snapshot().prefixVersion}</span>
            </span>
            <span class="text-v2-text-text-faint">
              {ctx.t("assembly.parent", { version: snapshot().parentVersion ?? "—" })}
            </span>
            <Show when={snapshot().bumpReason !== "initial"}>
              <span class="rounded-[5px] bg-v2-background-bg-layer-02 px-1.5 text-[11px] text-v2-text-text-muted">
                {ctx.t(`assembly.reason.${snapshot().bumpReason}`)}
              </span>
            </Show>
            <Show when={snapshot().pendingAdvance}>
              <span class="rounded-[5px] bg-v2-state-bg-warning px-1.5 text-[11px] text-v2-state-fg-warning">
                {ctx.t("assembly.pendingAdvance")}
              </span>
            </Show>
            <span class="ms-auto text-v2-text-text-faint">
              {ctx.t("assembly.agentModel", { agent: snapshot().agentID, model: snapshot().modelID })}
            </span>
          </div>
        )}
      </Show>

      {/* Layers in assembly order. Each expands to the rows it contributes, and a row expands to its text. */}
      <div class={`${card} flex flex-col overflow-hidden`}>
        <For each={layers()}>
          {(entry, index) => {
            const open = () => expandedLayers().has(entry.layer)
            const layerBytes = () => entry.rows.reduce((sum, row) => sum + row.bytes, 0)

            return (
              <div class="flex flex-col" classList={{ "border-t border-v2-border-border-muted": index() > 0 }}>
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 text-start hover:bg-v2-overlay-simple-overlay-hover"
                  onClick={() => toggleLayer(entry.layer)}
                  aria-expanded={open()}
                >
                  <Icon
                    name="chevron-right"
                    size="small"
                    class="shrink-0 text-v2-text-text-faint"
                    style={{ transform: open() ? "rotate(90deg)" : undefined }}
                  />
                  <span class="w-5 shrink-0 text-[11.5px] font-[590] tabular-nums text-v2-text-text-base">
                    {entry.layer}
                  </span>
                  <span class="min-w-0 truncate text-[11.5px] text-v2-text-text-muted">
                    {ctx.t(`assembly.layer.${entry.layer}`)}
                  </span>
                  <span
                    class="shrink-0 rounded-[4px] px-1 text-[10.5px]"
                    classList={{
                      "bg-v2-background-bg-layer-02 text-v2-text-text-muted": entry.churn === "frozen",
                      "bg-v2-background-bg-layer-03 text-v2-text-text-base": entry.churn === "low",
                      "bg-v2-state-bg-success text-v2-state-fg-success": entry.churn === "hot",
                    }}
                  >
                    {ctx.t(entry.churn === "frozen" ? "assembly.frozen" : entry.churn === "low" ? "assembly.low" : "assembly.hot")}
                  </span>
                  <Show when={entry.rows.length > 0}>
                    <span class="shrink-0 text-[10.5px] tabular-nums text-v2-text-text-faint">
                      {ctx.t("assembly.rowCount", { count: entry.rows.length })}
                    </span>
                  </Show>
                  <span class="ms-auto shrink-0 text-[11px] tabular-nums text-v2-text-text-faint">
                    {bytes(layerBytes())}
                  </span>
                </button>
                <Show when={open()}>
                  <Show
                    when={entry.rows.length > 0}
                    fallback={
                      <div class="border-t border-v2-border-border-muted bg-v2-background-bg-base px-3 py-2 text-[11px] text-v2-text-text-faint">
                        {ctx.t("assembly.emptyLayer")}
                      </div>
                    }
                  >
                    <div class="bg-v2-background-bg-base">
                      <For each={visibleRows(entry.layer, entry.rows)}>
                        {(row, rowIndex) => <RowView layer={entry.layer} row={row} index={rowIndex()} />}
                      </For>
                      <Show when={entry.rows.length > pageSize(entry.layer)}>
                        <button
                          type="button"
                          class="flex w-full items-center justify-center gap-1.5 border-t border-v2-border-border-muted px-3 py-2 text-[11.5px] text-v2-text-text-accent hover:bg-v2-overlay-simple-overlay-hover"
                          onClick={() => growPage(entry.layer)}
                        >
                          {ctx.t("assembly.loadMore")}
                          <span class="text-v2-text-text-faint">
                            {entry.rows.length - pageSize(entry.layer)}
                          </span>
                        </button>
                      </Show>
                    </div>
                  </Show>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      {/* Genealogy: every version ever built, oldest first. */}
      <Show when={(inspection()?.lineage.length ?? 0) > 0}>
        <div class={`${card} overflow-hidden`}>
          <For each={inspection()!.lineage}>
            {(entry, index) => (
              <div
                class="flex items-center gap-2.5 px-3 py-1.5 text-[11.5px]"
                classList={{ "border-t border-v2-border-border-muted": index() > 0 }}
              >
                <span class="w-10 shrink-0 tabular-nums text-v2-text-text-faint">
                  {ctx.t("assembly.epochShort", { epoch: entry.epoch })}
                </span>
                <span class="shrink-0 tabular-nums text-v2-text-text-base">v{entry.prefixVersion}</span>
                <span class="min-w-0 truncate text-v2-text-text-muted">
                  <Show when={entry.bumpReason !== "initial"}>{ctx.t(`assembly.reason.${entry.bumpReason}`)}</Show>
                </span>
                <span class="ms-auto shrink-0 text-v2-text-text-faint">
                  {new Intl.DateTimeFormat(i18n.locale(), { timeStyle: "medium" }).format(entry.created)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-center gap-3 text-[11px] text-v2-text-text-faint">
        <span>{ctx.t("assembly.frozenTotal", { size: bytes(totals().frozen) })}</span>
        <span class="ms-auto">{ctx.t("assembly.total", { size: bytes(totals().total) })}</span>
      </div>
    </section>
  )
}
