import type { PluginInfo } from "@opencode/client"
import { Predicate } from "effect"
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js"
import { Badge } from "@opencode/ui/badge"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { TruncatedText } from "@opencode/ui/truncated-text"
import { pluginLabel } from "@/providers/catalog/plugin"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { SettingsList } from "@/settings/list"
import { showToast } from "@/shell/notifications/toast"
import "@/settings/settings.css"
import { builtins } from "./builtins"
import { usePluginHost } from "./host"
import { useReservedPlugins } from "./root"

/**
 * The plugins a server lists, for the Plugins tab of Extensions. Only the desktop app's own server (`own`) runs its
 * plugins' GUIs in this window, so only its rows add the window's controls; other servers and the web list names.
 */
export function ExtensionPlugins(props: {
  plugins: readonly PluginInfo[]
  own: boolean
  showSource?: boolean
  selected?: string
  onSelect?: (id: string) => void
}) {
  const language = useLanguage()
  const listed = () => props.plugins.filter((plugin) => plugin.source.type !== "builtin")
  // The server reports plugins in discovery order; this list reads as an index too, so sort by the visible name.
  const sorted = createMemo(() => listed().toSorted((a, b) => pluginLabel(a).localeCompare(pluginLabel(b))))

  return (
    <>
      <Show
        when={props.own}
        fallback={
          <SettingsList variant="catalog">
            <For each={sorted()}>
              {(plugin) => {
                const name = pluginLabel(plugin)
                const id = plugin.id ?? name

                const lead = (
                  <div class="settings-extension-lead">
                    <Icon name="cube" class="text-v2-icon-icon-muted shrink-0" />
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <div class="settings-provider-main">
                        <TruncatedText text={name} class="settings-extension-name" />
                        <Show when={props.showSource}>
                          <PluginSource source={plugin.source.type} />
                        </Show>
                      </div>
                      {/* A name that already reads as its id does not repeat it underneath. */}
                      <Show when={plugin.id && plugin.id !== name ? plugin.id : undefined}>
                        {(secondary) => (
                          <div class="settings-provider-main settings-extension-note">
                            <bdi dir="ltr" class="min-w-0">
                              <TruncatedText text={secondary()} />
                            </bdi>
                          </div>
                        )}
                      </Show>
                    </div>
                  </div>
                )

                return props.onSelect ? (
                  <button
                    type="button"
                    class="settings-extension-row explore-plugin-row"
                    data-selected={props.selected === id ? "" : undefined}
                    onClick={() => props.onSelect?.(id)}
                  >
                    {lead}
                  </button>
                ) : (
                  <div class="settings-extension-row">{lead}</div>
                )
              }}
            </For>
          </SettingsList>
        }
      >
        <OwnServerPlugins
          plugins={listed()}
          showSource={props.showSource}
          selected={props.selected}
          onSelect={props.onSelect}
        />
      </Show>
      {/* Built-ins always run and stay out of the rows, so the list says where they went instead. */}
      <Show when={builtins.length > 0}>
        <p class="settings-extension-note">{language.t("settings.plugins.builtin.note")}</p>
      </Show>
    </>
  )
}

const sourceLabels = {
  builtin: "explore.plugins.source.builtin",
  package: "explore.plugins.source.package",
  local: "explore.plugins.source.local",
  sdk: "explore.plugins.source.sdk",
} as const

export function PluginSource(props: { source: PluginInfo["source"]["type"] }) {
  const language = useLanguage()

  return <Badge>{language.t(sourceLabels[props.source])}</Badge>
}

/**
 * The plugins of the desktop app's own server, merged by id with what main and this window know of their GUIs: a
 * switch that turns off only the desktop UI, Reload, status and errors, and rows for plugins main lists that the
 * server list does not name. Built-ins always run and stay hidden unless they failed, which only this list reports.
 */
function OwnServerPlugins(props: {
  plugins: readonly PluginInfo[]
  showSource?: boolean
  selected?: string
  onSelect?: (id: string) => void
}) {
  const language = useLanguage()
  const host = usePluginHost()
  const bridge = usePlatform().plugins
  const reserved = useReservedPlugins()

  const builtin = (id: string) => builtins.some((definition) => definition.id === id)

  // A server plugin's id can be a built-in's (a reserved id), so each row looks up its own kind of item.
  const itemOf = (id: string, kind: "builtin" | "config") =>
    host.installed().find((item) => item.id === id && item.builtin === (kind === "builtin"))

  const defined = (id: string) => !builtin(id) && host.definitions().some((definition) => definition.id === id)

  // What the window knows of a plugin on this server. A plugin without a GUI has nothing besides its name.
  const kind = (id: string | undefined) => {
    if (!id) return undefined

    if (reserved().includes(id)) return "reserved"
    const item = itemOf(id, "config")

    if (item?.unsupported) return "unsupported"

    // A bundle main could not read never reaches the window.
    if (item?.error !== undefined && !defined(id)) return "unreadable"

    if (item || defined(id)) return "loaded"

    return undefined
  }

  // Plugins main reports that the server list does not name, for example while that list loads or after it failed.
  const unnamed = createMemo(() => {
    const named = new Set(props.plugins.flatMap((plugin) => (plugin.id ? [plugin.id] : [])))

    return [
      ...new Set([
        ...host.definitions().flatMap((definition) => (builtin(definition.id) ? [] : [definition.id])),
        ...host.installed().flatMap((item) => (item.builtin ? [] : [item.id])),
        ...reserved(),
      ]),
    ].filter((id) => !named.has(id))
  })

  // Why the window entry or main's entry failed; either fails the plugin.
  const errorOf = (id: string, kind: "builtin" | "config") => host.failure(id)?.error ?? itemOf(id, kind)?.error

  // The server reports plugins in discovery order; the page reads as an index, so sort by the name a user sees.
  const listed = createMemo(() => props.plugins.toSorted((a, b) => pluginLabel(a).localeCompare(pluginLabel(b))))

  const failedBuiltins = createMemo(() =>
    host
      .definitions()
      .flatMap((definition) =>
        builtin(definition.id) && errorOf(definition.id, "builtin") !== undefined ? [definition.id] : [],
      ),
  )

  // The switch already shows whether a plugin runs; only the states it cannot show get a label.
  const status = (id: string, kind: "builtin" | "config") => {
    const value = host.status(id) ?? "loading"

    if (value === "failed" || (value === "active" && itemOf(id, kind)?.error))
      return language.t("settings.plugins.status.failed")

    if (value === "active" || value === "disabled") return undefined

    return language.t("settings.plugins.status.loading")
  }

  const reason = (cause: unknown) =>
    Predicate.hasProperty(cause, "code") && cause.code === "notFound"
      ? language.t("settings.plugins.error.notFound")
      : language.t("common.requestFailed")

  const run = (work: Promise<void> | undefined) =>
    (work ?? Promise.resolve()).catch((cause: unknown) => showToast({ variant: "error", title: reason(cause) }))

  const row = (input: {
    id: string | undefined
    name: string
    /** A machine id shown under the name when the name alone cannot identify the row. */
    secondary?: string
    builtin?: boolean
    source?: PluginInfo["source"]["type"]
  }) => {
    const state = () => (input.builtin ? "loaded" : kind(input.id))
    const part = input.builtin ? "builtin" : "config"
    const live = () => (state() === "loaded" ? input.id : undefined)
    /** What this row's switch leaves running besides the desktop UI. */
    const parts = () => {
      const item = input.id ? itemOf(input.id, part) : undefined

      return { server: item?.server, tui: item?.tui }
    }
    // Reload follows the id: a row main could not read still needs its retry.
    const actionable = () => (input.id && (state() === "loaded" || state() === "unreadable") ? input.id : undefined)
    // The switch is controlled by the stored value, so a failed request rolls back on its own; these only keep a
    // second click from racing the first and put the reason on the row instead of only in a toast.
    const [saving, setSaving] = createSignal(false)
    const [failure, setFailure] = createSignal<string | undefined>()
    // Reload is its own busy state, separate from a toggle's: only the Reload button reports it, and the switch
    // beside it stays flippable. The id says which row is reloading, so a second click cannot start a second reload.
    const [reloading, setReloading] = createSignal<string | undefined>()

    const toggle = (id: string, next: boolean) => {
      if (saving()) return

      setSaving(true)
      setFailure(undefined)
      const work = next ? bridge?.manager.enable(id) : bridge?.manager.disable(id)

      void (work ?? Promise.resolve())
        .catch((cause: unknown) => setFailure(reason(cause)))
        .finally(() => setSaving(false))
    }

    // Main entries reload through the manager; the renderer entry reloads here.
    const reload = (id: string) => {
      if (reloading() !== undefined) return

      setReloading(id)
      host.reload(id)
      void run(bridge?.manager.reload(id)).finally(() => setReloading(undefined))
    }

    const leadContent = (
      <>
        <Icon name="cube" class="text-v2-icon-icon-muted shrink-0" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="settings-provider-main">
            <bdi dir="auto" class="settings-extension-name truncate">
              {input.name}
            </bdi>
            <Show when={input.builtin}>
              <Badge>{language.t("settings.plugins.builtin")}</Badge>
            </Show>
            <Show when={!input.builtin && props.showSource && input.source}>
              {(source) => <PluginSource source={source()} />}
            </Show>
          </div>
          <Show when={input.secondary || parts().server || parts().tui}>
            <div class="settings-provider-main settings-extension-note">
              <Show when={input.secondary}>
                {(id) => (
                  <bdi dir="ltr" class="min-w-0">
                    <TruncatedText text={id()} />
                  </bdi>
                )}
              </Show>
              {/* Quiet text instead of two more badges, so a row keeps one main badge at most. */}
              <Show when={parts().server}>
                <span>{language.t("settings.plugins.part.server")}</span>
              </Show>
              <Show when={parts().tui}>
                <span>{language.t("settings.plugins.part.tui")}</span>
              </Show>
            </div>
          </Show>
          <Show when={live()}>
            {(id) => <Show when={errorOf(id(), part)}>{(error) => <PluginError error={error()} />}</Show>}
          </Show>
          <Show when={state() === "unsupported"}>
            <span class="settings-extension-note" data-tone="danger">
              {language.t("settings.plugins.unsupported")}
            </span>
          </Show>
          <Show when={state() === "unreadable" && input.id && itemOf(input.id, part)?.error}>
            {(error) => <PluginError error={error()} />}
          </Show>
          <Show when={state() === "reserved"}>
            <span class="settings-extension-note" data-tone="danger">
              {language.t("settings.plugins.reserved")}
            </span>
          </Show>
          <Show when={failure()}>
            {(message) => (
              <span class="settings-extension-note" data-tone="danger" role="alert">
                {message()}
              </span>
            )}
          </Show>
        </div>
      </>
    )

    return (
      <div class="settings-extension-row">
        <Show when={input.id && props.onSelect} fallback={<div class="settings-extension-lead">{leadContent}</div>}>
          <button
            type="button"
            class="settings-extension-lead explore-plugin-select"
            data-selected={props.selected === input.id ? "" : undefined}
            onClick={() => input.id && props.onSelect?.(input.id)}
          >
            {leadContent}
          </button>
        </Show>
        <Show when={actionable()}>
          {(id) => (
            <div class="settings-servers-actions" aria-busy={saving() || reloading() ? "true" : undefined}>
              {/* The state label lives in the trailing slot, so showing it never changes the row's height. */}
              <Show when={state() === "loaded" ? status(id(), part) : undefined}>
                {(label) => <span class="settings-extension-note">{label()}</span>}
              </Show>
              <Button
                size="small"
                variant="ghost"
                disabled={saving() || reloading() !== undefined}
                onClick={() => reload(id())}
              >
                {language.t("settings.plugins.reload")}
              </Button>
              {/* A built-in always runs; it keeps the switch's width, so every Reload lines up. */}
              <Show
                when={!input.builtin && state() === "loaded"}
                fallback={<span class="w-6 shrink-0" aria-hidden="true" />}
              >
                {/* Kept mounted while a toggle saves: replacing it with a spinner unmounted the control and dropped
                    focus out of the row. The pending state is the native `disabled` (Kobalte forwards it to the input
                    and switch.css paints `[data-disabled]`), so the node and the row's layout stay put; the brief
                    blur of the focused switch is a known trade-off of this state, not a missed fix. The actions
                    wrapper above also carries `aria-busy`, and Reload is disabled for the same span. */}
                <Switch
                  hideLabel
                  checked={itemOf(id(), part)?.enabled ?? true}
                  disabled={saving()}
                  onChange={(next) => toggle(id(), next)}
                >
                  {id()}
                </Switch>
              </Show>
            </div>
          )}
        </Show>
      </div>
    )
  }

  return (
    <>
      <SettingsList variant="catalog">
        <For each={listed()}>
          {(plugin) => {
            const name = pluginLabel(plugin)

            return row({
              id: plugin.id,
              name,
              // A row that already reads as its id does not repeat it underneath.
              secondary: name === plugin.id ? undefined : plugin.id,
              source: plugin.source.type,
            })
          }}
        </For>
        <For each={unnamed()}>
          {(id) => row({ id, name: language.t("settings.plugins.unknown"), secondary: id })}
        </For>
        <For each={failedBuiltins()}>{(id) => row({ id, name: id, builtin: true, source: "builtin" })}</For>
      </SettingsList>
      <Show when={host.installed().some((item) => !item.builtin)}>
        <p class="settings-extension-note">{language.t("settings.plugins.parts.note")}</p>
      </Show>
    </>
  )
}

/** A plugin's error: its first line, the message, with the rest (such as a stack trace) behind a toggle. */
function PluginError(props: { error: string }) {
  const language = useLanguage()
  const id = createUniqueId()
  const [open, setOpen] = createSignal(false)
  const message = () => props.error.split("\n", 1)[0]
  const more = () => props.error.trimEnd().includes("\n")

  return (
    <div class="flex min-w-0 flex-col items-start gap-1">
      <pre id={id} class="settings-server-dialog-error font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">
        {open() || !more() ? props.error : message()}
      </pre>
      <Show when={more()}>
        <Button
          size="small"
          variant="ghost-muted"
          class="settings-plugin-error-toggle"
          aria-expanded={open()}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          {language.t(open() ? "settings.plugins.error.hide" : "settings.plugins.error.show")}
        </Button>
      </Show>
    </div>
  )
}
