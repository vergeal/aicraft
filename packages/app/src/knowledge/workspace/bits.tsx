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
