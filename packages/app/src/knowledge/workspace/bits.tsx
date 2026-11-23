import { Icon } from "@opencode/ui/icon"
import { Show, type ComponentProps, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { KnowledgeFile } from "../store"
import { useWorkspace } from "./context"
import { fileProgress, fileStatus, statusLabelKey, statusTone } from "./format"
import type { WorkspaceView } from "./state"

/** Every icon the workspace may name, taken from the one icon set the app ships. */
export type IconName = ComponentProps<typeof Icon>["name"]

/** Every view is a section the shell keeps; the workspace paints only the current one. */
export function View(props: { name: WorkspaceView; children: JSX.Element }) {
  const ws = useWorkspace()

  return (
    <section class="view" data-view={props.name} data-active={ws.ui.store.view === props.name ? "" : undefined}>
      {props.children}
    </section>
  )
}

/**
 * The one page header every view uses: an optional way back, the view's name, one line of context,
 * and its actions. The page header sits on the reading measure; the column is the page.
 */
export function PageHead(props: {
  back?: { label: string; onClick: () => void }
  title: string
  description?: string
  actions?: JSX.Element
  meta?: JSX.Element
}) {
  return (
    <header class="kb-head">
      <Show when={props.back}>
        {(back) => (
          <button class="kb-back" type="button" onClick={back().onClick}>
            <Icon name="outline-arrow-left" class="ico ico-sm" />
            <span>{back().label}</span>
          </button>
        )}
      </Show>
      <div class="kb-head-row">
        <div class="kb-head-copy">
          <h1>{props.title}</h1>
          <Show when={props.description}>
            {(description) => <p>{description()}</p>}
          </Show>
        </div>
        <Show when={props.actions}>
          {(actions) => <div class="kb-head-actions">{actions()}</div>}
        </Show>
      </div>
      <Show when={props.meta}>{(meta) => <div class="kb-meta">{meta()}</div>}</Show>
    </header>
  )
}

/** The one status mark the workspace draws: a dot and a short label, never a colored pill. */
export function FileStatus(props: { file: KnowledgeFile }) {
  const language = useLanguage()
  const status = () => fileStatus(props.file)
  const progress = () => fileProgress(props.file)

  return (
    <span class="status" data-state={statusTone(status())}>
      <span class="dot" aria-hidden="true" />
      {language.t(statusLabelKey(status()))}
      <Show when={status() === "parsing" || status() === "indexing"}>
        <span class="pct"> {progress()}%</span>
      </Show>
    </span>
  )
}

/** Every document keeps one glyph; the format lives in its type column, not in a per-format icon. */
export function FileGlyph() {
  return <Icon name="file-document" class="ico" />
}

/** Tab stays inside an open modal; Escape and the scrim own dismissal. */
export function trapModalTab(event: KeyboardEvent, node: HTMLElement | undefined) {
  if (event.key !== "Tab" || !node) return

  const focusable = [
    ...node.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ]

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()

    return
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

export function LibraryGlyph() {
  return <Icon name="library" class="ico" />
}
