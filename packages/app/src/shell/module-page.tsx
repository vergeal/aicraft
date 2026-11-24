import { createSignal, onCleanup, Show, type JSX, type ParentProps } from "solid-js"
import { Portal } from "solid-js/web"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Icon } from "@aicraft/ui/icon"
import { PagePanel } from "@/shell/page"
import "./module-page.css"

/**
 * One fused module page: a single scroll surface whose title, groups and cards all live in the content area.
 * The sidebar no longer draws a second list for these destinations.
 */
export function ModulePage(props: ParentProps<{ label?: string; wide?: boolean; full?: boolean }>) {
  return (
    <PagePanel>
      <div class="module-page" data-scrollable data-full={props.full ? "" : undefined} aria-label={props.label}>
        <div class="module-page-inner" data-wide={props.wide ? "" : undefined}>
          {props.children}
        </div>
      </div>
    </PagePanel>
  )
}

/** The page title, its count, one line of context, and the page's own actions. */
export function ModuleHeader(props: {
  title: string
  count?: JSX.Element
  description?: string
  actions?: JSX.Element
}) {
  return (
    <header class="module-page-head">
      <div class="module-page-head-text">
        <h1>
          {props.title}
          <Show when={props.count}>
            <span class="count">{props.count}</span>
          </Show>
        </h1>
        <Show when={props.description}>
          <p>{props.description}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="module-page-head-actions">{props.actions}</div>
      </Show>
    </header>
  )
}

/**
 * A state group: the heading carries the state and its count, so no filter bar has to. A group with a toggle
 * collapses its cards; the heading stays one row.
 */
export function ModuleGroup(
  props: ParentProps<{ title: string; count?: number; collapsed?: boolean; onToggle?: () => void }>,
) {
  return (
    <section class="module-group">
      <header class="module-group-head">
        <Show when={props.onToggle} fallback={<span>{props.title}</span>}>
          <button type="button" aria-expanded={!props.collapsed} onClick={() => props.onToggle?.()}>
            <Icon name="chevron-down" size="small" class="module-group-chevron" />
            {props.title}
          </button>
        </Show>
        <Show when={props.count !== undefined}>
          <span class="count">{props.count}</span>
        </Show>
        <span class="rule" aria-hidden="true" />
      </header>
      <Show when={!props.collapsed}>{props.children}</Show>
    </section>
  )
}

export type ModuleSearchState = ReturnType<typeof createModuleSearch>

/**
 * The page's search lives in a glass overlay instead of a permanent field: the page keeps only its content, and
 * the current platform's search shortcut opens the same overlay.
 */
export function createModuleSearch() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const close = () => {
    setOpen(false)
    setQuery("")
  }

  onCleanup(
    makeEventListener(document, "keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return
      event.preventDefault()
      setOpen(true)
    }),
  )

  return { open, query, setQuery, show: () => setOpen(true), close }
}

/** The glass command-style overlay that owns a module page's search. */
export function ModuleSearch(props: {
  state: ModuleSearchState
  label: string
  placeholder: string
  hint?: string
  children: JSX.Element
}) {
  return (
    <Show when={props.state.open()}>
      <Portal>
        <div
          class="module-search-scrim"
          onClick={(event) => event.target === event.currentTarget && props.state.close()}
        >
          <div class="module-search-panel" role="dialog" aria-modal="true" aria-label={props.label}>
            <label class="module-search-field">
              <Icon name="magnifying-glass" size="small" class="module-search-icon" />
              <input
                ref={(element) => requestAnimationFrame(() => element.focus())}
                type="search"
                value={props.state.query()}
                placeholder={props.placeholder}
                aria-label={props.label}
                onInput={(event) => props.state.setQuery(event.currentTarget.value)}
                onKeyDown={(event) => event.key === "Escape" && props.state.close()}
              />
            </label>
            <div class="module-search-results">
              <Show when={props.hint}>{(hint) => <span class="module-search-hint">{hint()}</span>}</Show>
              {props.children}
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
