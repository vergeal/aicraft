import { makeEventListener } from "@solid-primitives/event-listener"
import { For, onMount, Show, type JSX } from "solid-js"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"

import { matchKeybind, parseKeybind, useCommand } from "@/shell/commands/command"
import {
  DESKTOP_MENU,
  desktopMenuKey,
  desktopMenuVisible,
  desktopMenuWithPlugins,
  type DesktopMenu,
  type DesktopMenuAction,
  type DesktopMenuEntry,
} from "@/shell/commands/desktop-menu"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { useMenubarItems } from "@/runtime/plugin/menubar-items"
import { useLayout } from "@/shell/state/layout"

const accelerators = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).flatMap((entry) => {
  if (entry.type === "separator" || !entry.action || !entry.accelerator?.windows) return []

  // Let the focused editor handle editing shortcuts without restoring stale menu focus.
  if (entry.action.startsWith("edit.")) return []

  return [{ action: entry.action, keybind: parseKeybind(entry.accelerator.windows) }]
})

export function windowsMenuAccelerator(event: KeyboardEvent) {
  return accelerators.find((entry) => matchKeybind(entry.keybind, event))?.action
}

type MenuSources = {
  command: ReturnType<typeof useCommand>
  platform: ReturnType<typeof usePlatform>
}

/** The behaviour both menu shapes share: reading the entries, focusing the prior target, and running one. */
function useMenuRunner(props: MenuSources) {
  let lastFocused: HTMLElement | undefined
  const language = useLanguage()
  const menubar = useMenubarItems()
  const layout = useLayout()

  const entries = (menu: DesktopMenu) =>
    desktopMenuWithPlugins(
      (menu.items ?? [])
        .filter((entry) => desktopMenuVisible(entry, "windows"))
        .map((entry) => ({ key: desktopMenuKey(entry), entry })),
      menubar?.items().filter((item) => item.menu === menu.id) ?? [],
    )

  const rememberFocus = () => {
    const active = document.activeElement
    lastFocused = active instanceof HTMLElement ? active : undefined
  }

  const commandDisabled = (id: string) => {
    const option = props.command.options.find((option) => option.id === id)

    if (!option) return true

    return option.disabled ?? false
  }

  const runCommand = (id: string) => {
    if (commandDisabled(id)) return
    props.command.trigger(id)
  }

  const runAction = (action: DesktopMenuAction) => {
    if (action.startsWith("edit.") && lastFocused?.isConnected) lastFocused.focus({ preventScroll: true })
    void props.platform.runDesktopMenuAction?.(action)
  }

  const runEntry = (entry: DesktopMenuEntry) => {
    if (entry.type === "separator") return

    if (entry.command) {
      runCommand(entry.command)

      return
    }

    if (entry.action) {
      runAction(entry.action)

      return
    }

    if (entry.href) props.platform.openExternal(entry.href)
  }

  return { language, menubar, entries, rememberFocus, commandDisabled, runEntry, runAction, layout }
}

/** The compact hamburger: one button that opens the whole menu as a nested list. */
export function WindowsAppMenu(props: MenuSources) {
  const runner = useMenuRunner(props)
  const language = runner.language

  onMount(() => {
    makeEventListener(
      document,
      "keydown",
      (event) => {
        if (event.defaultPrevented) return
        const action = windowsMenuAccelerator(event)

        if (!action) return
        event.preventDefault()
        event.stopPropagation()
        runner.runAction(action)
      },
      { capture: true },
    )
  })

  return (
    <Menu appearance="standard" gutter={4} modal={false} placement="bottom-start">
      <div
        data-component="desktop-icon-button"
        class="flex h-7 w-9 shrink-0 items-center justify-center rounded-full px-1"
      >
        <Menu.Trigger
          as={IconButton}
          variant="ghost-muted"
          size="large"
          icon={<Icon name="menu" />}
          aria-label={language.t("desktop.menu.ariaLabel")}
          onPointerDown={runner.rememberFocus}
          onKeyDown={runner.rememberFocus}
        />
      </div>
      <Menu.Portal>
        <Menu.Content class="desktop-app-menu">
          <Menu.Group>
            <Menu.GroupLabel class="desktop-app-menu-heading">{language.t("desktop.menu.app")}</Menu.GroupLabel>
            <For each={DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "windows"))}>
              {(menu) => (
                <DesktopMenuSubmenu label={language.t(menu.labelKey)}>
                  <For each={runner.entries(menu)}>
                    {(item) => {
                      const entry = item.entry

                      // Static menu data: an early return keeps the union narrowing a Show fallback would lose.
                      if ("menu" in entry)
                        return (
                          <DesktopMenuItem
                            label={entry.label}
                            disabled={!entry.enabled}
                            onSelect={() => runner.menubar?.run(entry.id)}
                          />
                        )

                      if (entry.type === "separator") return <Menu.Separator />

                      // Plain accessors rather than conditional JSX expressions, which compile to memos created
                      // where the menu reads the prop, possibly outside this owner.
                      const label = () => (entry.labelKey ? language.t(entry.labelKey) : "")

                      const keybind = () =>
                        entry.command ? props.command.keybind(entry.command) : entry.accelerator?.windows

                      const disabled = () => (entry.command ? runner.commandDisabled(entry.command) : false)

                      if (entry.toggle === "perfMonitor")
                        return (
                          <DesktopMenuToggleItem
                            label={label()}
                            checked={runner.layout.perfMonitor.enabled()}
                            onChange={(checked) => runner.layout.perfMonitor.setEnabled(checked)}
                          />
                        )

                      return (
                        <DesktopMenuItem
                          label={label()}
                          keybind={keybind()}
                          disabled={disabled()}
                          onSelect={() => runner.runEntry(entry)}
                        />
                      )
                    }}
                  </For>
                </DesktopMenuSubmenu>
              )}
            </For>
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}

/** Top-level menus that fit the titlebar row; the rest stay in the hamburger list. */
const BAR_MENUS = new Set(["file", "edit", "view"])

/**
 * The horizontal menu bar: a few top-level menus sit in the chrome row itself, and opening one drops its list
 * below that label instead of hiding the whole menu behind a single hamburger.
 */
export function WindowsMenuBar() {
  const command = useCommand()
  const platform = usePlatform()
  const runner = useMenuRunner({ command, platform })

  const visible = () =>
    platform.platform === "desktop" && (platform.os === "windows" || platform.os === "linux")

  onMount(() => {
    makeEventListener(
      document,
      "keydown",
      (event) => {
        if (event.defaultPrevented) return
        const action = windowsMenuAccelerator(event)

        if (!action) return
        event.preventDefault()
        event.stopPropagation()
        runner.runAction(action)
      },
      { capture: true },
    )
  })

  return (
    <Show when={visible()}>
      <div data-component="desktop-menu-bar" class="flex shrink-0 items-center gap-0.5">
        <For each={DESKTOP_MENU.filter((menu) => BAR_MENUS.has(menu.id) && desktopMenuVisible(menu, "windows"))}>
          {(menu) => (
            <Menu appearance="standard" gutter={4} modal={false} placement="bottom-start">
              <Menu.Trigger
                data-replica-control
                class="flex h-7 shrink-0 items-center rounded-[var(--radius-control)] px-2 text-[13px] leading-[var(--line-height-compact)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-main)] data-[expanded]:bg-[var(--color-selected)] data-[expanded]:text-[var(--color-text-main)] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--color-border)]"
                onPointerDown={runner.rememberFocus}
                onKeyDown={runner.rememberFocus}
              >
                {runner.language.t(menu.labelKey)}
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content class="desktop-app-menu desktop-app-menu-bar">
                  <Menu.Group>
                    <For each={runner.entries(menu)}>
                      {(item) => {
                        const entry = item.entry

                        // Static menu data: an early return keeps the union narrowing a Show fallback would lose.
                        if ("menu" in entry)
                          return (
                            <DesktopMenuItem
                              label={entry.label}
                              disabled={!entry.enabled}
                              onSelect={() => runner.menubar?.run(entry.id)}
                            />
                          )

                        if (entry.type === "separator") return <Menu.Separator />

                        const label = () => (entry.labelKey ? runner.language.t(entry.labelKey) : "")

                        const keybind = () =>
                          entry.command ? command.keybind(entry.command) : entry.accelerator?.windows

                        const disabled = () => (entry.command ? runner.commandDisabled(entry.command) : false)

                        if (entry.toggle === "perfMonitor")
                          return (
                            <DesktopMenuToggleItem
                              label={label()}
                              checked={runner.layout.perfMonitor.enabled()}
                              onChange={(checked) => runner.layout.perfMonitor.setEnabled(checked)}
                            />
                          )

                        return (
                          <DesktopMenuItem
                            label={label()}
                            keybind={keybind()}
                            disabled={disabled()}
                            onSelect={() => runner.runEntry(entry)}
                          />
                        )
                      }}
                    </For>
                  </Menu.Group>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          )}
        </For>
      </div>
    </Show>
  )
}

function DesktopMenuSubmenu(props: { label: string; children: JSX.Element }) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger>{props.label}</Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent class="desktop-app-menu desktop-app-menu-sub">{props.children}</Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  )
}

function DesktopMenuToggleItem(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Menu.CheckboxItem checked={props.checked} onChange={(checked) => props.onChange(checked === true)}>
      {props.label}
    </Menu.CheckboxItem>
  )
}

function DesktopMenuItem(props: { label: string; keybind?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <Menu.Item disabled={props.disabled} onSelect={props.onSelect} shortcut={props.keybind}>
      {props.label}
    </Menu.Item>
  )
}
