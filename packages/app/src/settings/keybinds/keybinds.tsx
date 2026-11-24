import { For, Show, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Button } from "@aicraft/ui/button"
import { Keybind } from "@aicraft/ui/keybind"
import { showToast } from "@/shell/notifications/toast"
import fuzzysort from "fuzzysort"
import { Predicate } from "effect"
import {
  DEFAULT_PALETTE_KEYBIND,
  formatKeybind,
  formatKeybindParts,
  keyFromKeyboardEvent,
  parseKeybind,
  useCommand,
  type CommandSection,
} from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { useSettings } from "@/settings/model"
import { SettingsList } from "@/settings/list"
import { SettingsSearchEmpty } from "@/settings/search-empty"
import { SettingsSearchField } from "@/settings/search-field"
import { SettingsPageHeader } from "@/settings/page-header"

const IS_MAC = typeof navigator !== "undefined" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)

const PALETTE_ID = "command.palette"

type KeybindGroup = "General" | "Session" | "Navigation" | "Model and agent" | "Terminal" | "Prompt"

type KeybindMeta = {
  title: string
  group: KeybindGroup
}

type KeybindMap = Record<string, string | undefined>

type CommandContext = ReturnType<typeof useCommand>

type LanguageContext = ReturnType<typeof useLanguage>

type SettingsContext = ReturnType<typeof useSettings>

const GROUPS: KeybindGroup[] = ["General", "Session", "Navigation", "Model and agent", "Terminal", "Prompt"]

type GroupKey =
  | "settings.shortcuts.group.general"
  | "settings.shortcuts.group.session"
  | "settings.shortcuts.group.navigation"
  | "settings.shortcuts.group.modelAndAgent"
  | "settings.shortcuts.group.terminal"
  | "settings.shortcuts.group.prompt"

const groupKey: Record<KeybindGroup, GroupKey> = {
  General: "settings.shortcuts.group.general",
  Session: "settings.shortcuts.group.session",
  Navigation: "settings.shortcuts.group.navigation",
  "Model and agent": "settings.shortcuts.group.modelAndAgent",
  Terminal: "settings.shortcuts.group.terminal",
  Prompt: "settings.shortcuts.group.prompt",
}

const sectionGroup: Record<CommandSection, KeybindGroup> = {
  general: "General",
  session: "Session",
  navigation: "Navigation",
  model: "Model and agent",
  terminal: "Terminal",
  prompt: "Prompt",
}

function groupFor(id: string, section?: CommandSection): KeybindGroup {
  if (section) return sectionGroup[section]

  if (id === PALETTE_ID) return "General"

  if (id.startsWith("model.") || id.startsWith("agent.") || id.startsWith("mcp.")) return "Model and agent"

  if (id.startsWith("file.") || id.startsWith("fileTree.")) return "Navigation"

  if (id.startsWith("prompt.")) return "Prompt"

  if (
    id.startsWith("session.") ||
    id.startsWith("message.") ||
    id.startsWith("permissions.") ||
    id.startsWith("steps.") ||
    id.startsWith("review.")
  )
    return "Session"

  return "General"
}

function isModifier(key: string) {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta"
}

function recordKeybind(event: KeyboardEvent) {
  if (isModifier(event.key)) return

  // Tab is the keyboard's own navigation key: recording it would both swallow the focus move and bind a key the user
  // can never press inside a text field. The capture listener lets it through and stops recording instead.
  if (event.key === "Tab") return

  const parts: string[] = []

  const mod = IS_MAC ? event.metaKey : event.ctrlKey

  if (mod) parts.push("mod")

  if (IS_MAC && event.ctrlKey) parts.push("ctrl")

  if (!IS_MAC && event.metaKey) parts.push("meta")

  if (event.altKey) parts.push("alt")

  if (event.shiftKey) parts.push("shift")

  const key = keyFromKeyboardEvent(event)

  if (!key) return
  parts.push(key)

  return parts.join("+")
}

function signatures(config: string | undefined) {
  if (!config) return []
  const sigs: string[] = []

  for (const kb of parseKeybind(config)) {
    const parts: string[] = []

    if (kb.ctrl) parts.push("ctrl")

    if (kb.alt) parts.push("alt")

    if (kb.shift) parts.push("shift")

    if (kb.meta) parts.push("meta")

    if (kb.key) parts.push(kb.key)

    if (parts.length === 0) continue
    sigs.push(parts.join("+"))
  }

  return sigs
}

function listFor(
  command: Pick<CommandContext, "catalog" | "options">,
  map: KeybindMap,
  palette: string,
  plugins: ReadonlySet<string> | undefined,
) {
  const out = new Map<string, KeybindMeta>()
  out.set(PALETTE_ID, { title: palette, group: "General" })
  // A command that shares another's shortcut is set through that command, unless it already has its own.
  const follower = (opt: { id: string; follows?: string }) => !!opt.follows && !Predicate.isString(map[opt.id])

  for (const opt of command.catalog) {
    if (opt.id.startsWith("suggested.")) continue

    // The catalog remembers commands that are not registered right now; a removed or renamed plugin's never return.
    if (opt.plugin && plugins && !plugins.has(opt.plugin)) continue

    if (opt.hidden) continue

    if (follower(opt)) continue
    out.set(opt.id, { title: opt.title, group: groupFor(opt.id, opt.section) })
  }

  for (const opt of command.options) {
    if (opt.id.startsWith("suggested.")) continue

    if (opt.hidden) continue

    if (follower(opt)) continue
    out.set(opt.id, { title: opt.title, group: groupFor(opt.id, opt.section) })
  }

  for (const [id, value] of Object.entries(map)) {
    if (!Predicate.isString(value)) continue

    if (out.has(id)) continue
    out.set(id, { title: id, group: groupFor(id) })
  }

  return out
}

function groupedFor(list: Map<string, KeybindMeta>) {
  const out = new Map<KeybindGroup, string[]>()

  for (const group of GROUPS) out.set(group, [])

  for (const [id, item] of list) {
    const ids = out.get(item.group)

    if (!ids) continue
    ids.push(id)
  }

  for (const group of GROUPS) {
    const ids = out.get(group)

    if (!ids) continue
    ids.sort((a, b) => (list.get(a)?.title ?? "").localeCompare(list.get(b)?.title ?? ""))
  }

  return out
}

/* The display form is glyphs on macOS (⌘⇧P) and localized words elsewhere, so a search for the key's own name
   ("cmd", "command", "option") never matched. These aliases are searchable text only; the row still renders the
   localized display form. */
const KEY_SEARCH_ALIASES: Record<string, string> = {
  mod: "cmd command ctrl control",
  meta: "cmd command meta",
  ctrl: "ctrl control",
  alt: "option alt",
  shift: "shift",
}

function searchAliases(config: string | undefined) {
  if (!config) return ""

  return config
    .split(/[^a-z0-9]+/i)
    .flatMap((part) => KEY_SEARCH_ALIASES[part.toLowerCase()] ?? [])
    .join(" ")
}

function filteredFor(
  query: string,
  list: Map<string, KeybindMeta>,
  grouped: Map<KeybindGroup, string[]>,
  keybind: (id: string) => string,
  aliases: (id: string) => string,
) {
  const value = query.toLowerCase().trim()

  if (!value) return grouped

  const out = new Map<KeybindGroup, string[]>()

  for (const group of GROUPS) out.set(group, [])

  const items = Array.from(list.entries()).map(([id, meta]) => {
    const display = keybind(id)

    return {
      id,
      title: meta.title,
      group: meta.group,
      search: `${display} ${aliases(id)}`,
    }
  })

  const results = fuzzysort.go(value, items, {
    keys: ["title", "search"],
    threshold: -10000,
  })

  for (const result of results) {
    const ids = out.get(result.obj.group)

    if (!ids) continue
    ids.push(result.obj.id)
  }

  return out
}

export function createKeybindSettingsController(
  input: {
    command: Pick<CommandContext, "catalog" | "options" | "keybinds">
    /** The ids of the installed GUI plugins; remembered commands of any other plugin are not listed. */
    plugins?: () => ReadonlySet<string>
    settings: {
      current: { keybinds?: KeybindMap }
      keybinds: Pick<SettingsContext["keybinds"], "get" | "set" | "resetAll">
    }
    target?: Document
    notify?: (toast: { title: string; description: string }) => void
  },
  language: Pick<LanguageContext, "locale" | "t"> = useLanguage(),
) {
  const [store, setStore] = createStore<{ active: string | null }>({ active: null })
  const overrides = createMemo(() => input.settings.current.keybinds ?? {})

  const list = createMemo(() => {
    language.locale()

    return listFor(input.command, overrides(), language.t("command.palette"), input.plugins?.())
  })

  const grouped = createMemo(() => groupedFor(list()))
  const title = (id: string) => list().get(id)?.title ?? ""

  const effective = (id: string) => {
    if (id === PALETTE_ID) return input.settings.keybinds.get(id) ?? DEFAULT_PALETTE_KEYBIND

    const custom = input.settings.keybinds.get(id)

    if (Predicate.isString(custom)) return custom

    const live = input.command.options.find((item) => item.id === id)

    if (live?.keybind) return live.keybind

    return input.command.catalog.find((item) => item.id === id)?.keybind
  }

  const used = createMemo(() => {
    const value = new Map<string, { id: string; title: string }[]>()

    for (const id of list().keys()) {
      for (const signature of signatures(effective(id))) {
        const items = value.get(signature)

        if (items) {
          items.push({ id, title: title(id) })
          continue
        }

        value.set(signature, [{ id, title: title(id) }])
      }
    }

    return value
  })

  const stop = () => {
    if (!store.active) return
    setStore("active", null)
    input.command.keybinds(true)
  }

  const toggle = (id: string) => {
    if (store.active === id) {
      stop()

      return
    }

    if (store.active) stop()
    setStore("active", id)
    input.command.keybinds(false)
  }

  const unbind = (id: string) => {
    input.settings.keybinds.set(id, "none")
    stop()
  }

  const notify = input.notify ?? ((toast: { title: string; description: string }) => showToast(toast))

  const handle = (event: KeyboardEvent) => {
    const id = store.active

    if (!id) return

    // Tab belongs to the keyboard, not the recorder: it leaves the row instead of binding, and `recordKeybind`
    // never binds it. Swallowing it trapped keyboard users in the recorder with only Escape to get out.
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      stop()

      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (event.key === "Escape") {
      stop()

      return
    }

    const clear =
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey

    if (clear) {
      unbind(id)

      return
    }

    const next = recordKeybind(event)

    if (!next) return

    const conflicts = new Map<string, string>()

    for (const signature of signatures(next)) {
      for (const item of used().get(signature) ?? []) {
        if (item.id === id) continue
        conflicts.set(item.id, item.title)
      }
    }

    if (conflicts.size > 0) {
      notify({
        title: language.t("settings.shortcuts.conflict.title"),
        description: language.t("settings.shortcuts.conflict.description", {
          keybind: formatKeybind(next, language.t),
          titles: [...conflicts.values()].join(", "),
        }),
      })

      return
    }

    input.settings.keybinds.set(id, next)
    stop()
  }

  const target = input.target ?? (typeof document !== "undefined" ? document : undefined)

  if (target) makeEventListener(target, "keydown", handle, { capture: true })

  onCleanup(() => {
    if (store.active) input.command.keybinds(true)
  })

  return {
    catalog: {
      groups: GROUPS,
      filtered: (query: string) =>
        filteredFor(
          query,
          list(),
          grouped(),
          (id) =>
            (effective(id) ?? "")
              .split(",")
              .map((combo) => formatKeybind(combo, language.t))
              .join(" "),
          (id) => searchAliases(effective(id)),
        ),
      title,
      keybind: (id: string) => formatKeybind(effective(id) ?? "", language.t),
      // `formatKeybind` keeps only the first combination; the list shows every one of them.
      keybindCombos: (id: string) =>
        (effective(id) ?? "")
          .split(",")
          .map((combo) => formatKeybindParts(combo, language.t))
          .filter((parts) => parts.length > 0),
      keybindText: (id: string) =>
        (effective(id) ?? "")
          .split(",")
          .map((combo) => formatKeybind(combo, language.t))
          .filter(Boolean)
          .join(", "),
    },
    capture: {
      active: () => store.active,
      toggle,
      unbind,
    },
    settings: {
      hasOverrides: () => Object.values(overrides()).some(Predicate.isString),
      reset: () => {
        stop()
        input.settings.keybinds.resetAll()
        notify({
          title: language.t("settings.shortcuts.reset.toast.title"),
          description: language.t("settings.shortcuts.reset.toast.description"),
        })
      },
    },
  }
}

export function SettingsKeybinds(props: { active?: boolean }) {
  const command = useCommand()
  const settings = useSettings()
  const host = usePluginHost()
  const plugins = createMemo(() => new Set(host.definitions().map((definition) => definition.id)))

  const controller = createKeybindSettingsController({
    command,
    plugins,
    settings,
  })

  return (
    <SettingsKeybindsView
      visible={props.active}
      groups={controller.catalog.groups}
      filtered={controller.catalog.filtered}
      title={controller.catalog.title}
      combos={controller.catalog.keybindCombos}
      keybindText={controller.catalog.keybindText}
      active={controller.capture.active()}
      onCapture={controller.capture.toggle}
      onUnbind={controller.capture.unbind}
      hasOverrides={controller.settings.hasOverrides()}
      onReset={controller.settings.reset}
    />
  )
}

function SettingsKeybindsView(props: {
  visible?: boolean
  groups: KeybindGroup[]
  filtered: (query: string) => Map<KeybindGroup, string[]>
  title: (id: string) => string
  combos: (id: string) => string[][]
  keybindText: (id: string) => string
  active: string | null
  onCapture: (id: string) => void
  onUnbind: (id: string) => void
  hasOverrides: boolean
  onReset: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ filter: "" })
  const filtered = createMemo(() => props.filtered(store.filter))
  const hasResults = createMemo(() => props.groups.some((group) => (filtered().get(group)?.length ?? 0) > 0))

  return (
    <>
      <SettingsPageHeader
        stacked
        title={language.t("settings.shortcuts.title")}
        description={language.t("settings.shortcuts.description")}
        actions={
          <Button variant="ghost" onClick={props.onReset} disabled={!props.hasOverrides}>
            {language.t("settings.shortcuts.reset.button")}
          </Button>
        }
      >
        <SettingsSearchField
          value={store.filter}
          active={props.visible ?? true}
          onInput={(value) => setStore("filter", value)}
          placeholder={language.t("settings.shortcuts.search.placeholder")}
        />
      </SettingsPageHeader>
      <div class="settings-tab-body">
        <div class="settings-shortcuts settings-section-stack">
          <For each={props.groups}>
            {(group) => (
              <Show when={(filtered().get(group) ?? []).length > 0}>
                <div class="settings-section">
                  <h3 class="settings-section-title">{language.t(groupKey[group])}</h3>
                  <SettingsList>
                    <For each={filtered().get(group) ?? []}>
                      {(id) => {
                        const combos = () => props.combos(id)
                        const recording = () => props.active === id

                        return (
                          <div
                            class="settings-shortcut-row flex items-center justify-between gap-4"
                            data-recording={recording() ? "" : undefined}
                            onClick={() => props.onCapture(id)}
                          >
                            <span class="settings-shortcut-name">{props.title(id)}</span>
                            <div class="settings-shortcut-keys">
                              <Show when={recording() && combos().length > 0}>
                                <Button
                                  type="button"
                                  size="small"
                                  variant="ghost-danger"
                                  onClick={(event: MouseEvent) => {
                                    event.stopPropagation()
                                    props.onUnbind(id)
                                  }}
                                >
                                  {language.t("settings.shortcuts.unbind")}
                                </Button>
                              </Show>
                              <button
                                type="button"
                                class="settings-shortcut-capture"
                                data-keybind-id={id}
                                data-expanded={recording() ? "" : undefined}
                                aria-label={
                                  recording()
                                    ? language.t("settings.shortcuts.capture.recording", {
                                        name: props.title(id),
                                      })
                                    : language.t("settings.shortcuts.capture.current", {
                                        name: props.title(id),
                                        keys: props.keybindText(id) || language.t("settings.shortcuts.unassigned"),
                                      })
                                }
                              >
                                <Show
                                  when={recording()}
                                  fallback={
                                    <Show
                                      when={combos().length > 0}
                                      fallback={
                                        <span class="settings-shortcut-unassigned">
                                          {language.t("settings.shortcuts.unassigned")}
                                        </span>
                                      }
                                    >
                                      <For each={combos()}>
                                        {(parts) => <Keybind keys={parts} variant="outline" />}
                                      </For>
                                    </Show>
                                  }
                                >
                                  <span class="settings-shortcut-press-keys">
                                    {language.t("settings.shortcuts.pressKeys")}
                                  </span>
                                </Show>
                              </button>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </SettingsList>
                </div>
              </Show>
            )}
          </For>
          <Show when={store.filter && !hasResults()}>
            <div class="settings-tab-search-empty">
              <SettingsSearchEmpty query={store.filter} />
            </div>
          </Show>
        </div>
      </div>
    </>
  )
}
