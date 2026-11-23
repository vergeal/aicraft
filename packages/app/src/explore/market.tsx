import { PluginGlyph } from "@/explore/plugin-icon"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { For, Show, type JSX } from "solid-js"
import "./explore.css"

/** Where an entry comes from; the row's accessible label names it. */
export type MarketSource = {
  kind: "builtin" | "package" | "local" | "sdk" | "project" | "available"
  label: string
}

/** One row of the market: the entry's identity, one line about it, and what the row does. */
export type MarketEntry = {
  key: string
  name: string
  description: string
  source: MarketSource
  /** The identity colour bucket for the tile; entries without a manifest mark show their initial on it. */
  tone: number
  /** The entry's own inline SVG mark, when its manifest declares one. */
  icon?: string
  /** The fallback mark a tile without an icon shows: the shared skill glyph or the shared plugin glyph. */
  glyph: "skill" | "plugin"
  /** A short chip after the name, such as the marker on a skill that ships with the app. */
  badge?: string
  failed: boolean
  /** What a screen reader hears for the whole row. */
  label: string
  /** Opens the entry's own page. */
  open: () => void
  /** Installs the entry; absent when the row is already installed. */
  install?: () => void
  /** What a screen reader hears on the install button. */
  installLabel?: string
}

export type MarketSection = { key: string; title: string; entries: MarketEntry[] }

export type MarketGroup = { key: string; title: string; entries: MarketEntry[]; sections?: readonly MarketSection[] }

export type MarketTab = { id: string; label: string; selected: boolean; onSelect: () => void }

/** The shared skill mark: two stacked cards with an instruction bar and a spark, painted in the tile's own colour. */
function SkillGlyph() {
  return (
    <svg
      class="explore-market-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="8.5" y="3.25" width="11.25" height="13" rx="2.75" opacity=".5" />
      <rect x="4.25" y="7.25" width="11.25" height="13.5" rx="2.75" />
      <path d="M7.25 11.5h5" />
      <path d="M16.1 15.2c.21 1.32.75 1.86 2.07 2.07-1.32.21-1.86.75-2.07 2.07-.21-1.32-.75-1.86-2.07-2.07 1.32-.21 1.86-.75 2.07-2.07Z" />
    </svg>
  )
}

/**
 * The market list: a title and its tools, then one group per installed shelf, each split into the client's
 * categories with two rows per line. A row opens the entry, and the trailing mark installs it or reports that it is
 * installed.
 */
export function ExploreMarket(props: {
  sectionKey: string
  tabsLabel: string
  tabs: readonly MarketTab[]
  title: string
  description: string
  query: string
  searchPlaceholder: string
  searchLabel: string
  onQuery: (value: string) => void
  setField: (element: HTMLInputElement) => void
  refreshLabel: string
  refreshing: boolean
  onRefresh: () => void
  addLabel: string
  onAdd: () => void
  loading: boolean
  groups: readonly MarketGroup[]
  emptyTitle: string
  emptyHint: string
  alert?: JSX.Element
}) {
  return (
    <div class="explore-market">
      <div class="explore-market-tabs" role="tablist" aria-label={props.tabsLabel}>
        <For each={props.tabs}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab.selected}
              data-selected={tab.selected ? "" : undefined}
              onClick={() => tab.onSelect()}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <header class="explore-market-head">
        <div>
          <h1>{props.title}</h1>
          <p class="explore-market-sub">{props.description}</p>
        </div>

        <div class="explore-market-tools">
          <label class="explore-market-search">
            <Icon name="magnifying-glass" size="small" class="explore-market-search-icon" />
            <input
              ref={(element) => props.setField(element)}
              type="search"
              value={props.query}
              placeholder={props.searchPlaceholder}
              aria-label={props.searchLabel}
              autocomplete="off"
              spellcheck={false}
              onInput={(event) => props.onQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return

                props.onQuery("")
                event.currentTarget.blur()
              }}
            />
          </label>

          <button
            type="button"
            class="explore-market-icon"
            aria-label={props.refreshLabel}
            aria-busy={props.refreshing}
            disabled={props.refreshing}
            onClick={() => props.onRefresh()}
          >
            <Icon name="refresh" size="small" />
          </button>

          <button type="button" class="explore-market-add" onClick={() => props.onAdd()}>
            {props.addLabel}
            <Icon name="chevron-down" size="small" />
          </button>
        </div>
      </header>

      {props.alert}

      <Show
        when={!props.loading}
        fallback={
          <div class="explore-market-loading" aria-busy="true">
            <Loader />
          </div>
        }
      >
        <Show
          when={props.groups.length > 0}
          fallback={
            <div class="explore-market-empty">
              <strong>{props.emptyTitle}</strong>
              <span>{props.emptyHint}</span>
            </div>
          }
        >
          {/* A new shelf rebuilds the list, so its groups replay the entrance instead of swapping in place. */}
          <Show when={props.sectionKey} keyed={true}>
            {(sectionKey) => (
              <div class="explore-market-groups" data-section={sectionKey}>
                <For each={props.groups}>
                  {(group) => (
                    <section class="explore-market-group">
                      <div class="explore-market-group-head">
                        <h2 class="explore-market-group-title">{group.title}</h2>
                        <span class="explore-market-group-rule" aria-hidden="true" />
                      </div>
                      <Show when={group.sections} fallback={<MarketRows entries={group.entries} />}>
                        {(sections) => (
                          <For each={sections()}>
                            {(section) => (
                              <div class="explore-market-section">
                                <h3 class="explore-market-section-title">{section.title}</h3>
                                <MarketRows entries={section.entries} />
                              </div>
                            )}
                          </For>
                        )}
                      </Show>
                    </section>
                  )}
                </For>
              </div>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  )
}

/** One grid of rows: two per line, or one when the content column is narrow. */
function MarketRows(props: { entries: readonly MarketEntry[] }) {
  return (
    <div class="explore-market-items">
      <For each={props.entries}>{(entry) => <MarketRow entry={entry} />}</For>
    </div>
  )
}

/** One entry: the tile, the name with its origin, one line of description, and the install mark. */
function MarketRow(props: { entry: MarketEntry }) {
  const entry = () => props.entry

  const activate = () => entry().open()

  return (
    <div
      class="explore-market-row"
      role="button"
      tabindex="0"
      data-failed={entry().failed ? "" : undefined}
      aria-label={entry().label}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return

        event.preventDefault()
        activate()
      }}
    >
      <span class="explore-market-tile" data-tone={entry().icon ? undefined : entry().tone} aria-hidden="true">
        <Show
          when={entry().icon}
          fallback={entry().glyph === "skill" ? <SkillGlyph /> : <PluginGlyph size={24} />}
        >
          {(mark) => (
            <span
              class="explore-market-mark"
              data-skill={entry().glyph === "skill" ? "" : undefined}
              innerHTML={mark()}
            />
          )}
        </Show>
      </span>

      <span class="explore-market-copy">
        <span class="explore-market-title">
          <span class="explore-market-name">{entry().name}</span>
          <Show when={entry().badge}>
            {(badge) => <span class="explore-market-badge">{badge()}</span>}
          </Show>
        </span>
        <span class="explore-market-desc">{entry().description}</span>
      </span>

      <Show
        when={entry().install}
        fallback={
          <span class="explore-market-act" aria-hidden="true">
            <Icon name="check" size="small" />
          </span>
        }
      >
        <button
          type="button"
          class="explore-market-act"
          aria-label={entry().installLabel}
          onClick={(event) => {
            event.stopPropagation()
            entry().install?.()
          }}
        >
          <Icon name="plus" size="small" />
        </button>
      </Show>
    </div>
  )
}
