import { Predicate } from "effect"
import { Component, For, Show, createEffect, createMemo, onCleanup, type JSX } from "solid-js"
import { createQuery } from "@tanstack/solid-query"
import { useDialog } from "@opencode/ui/context/dialog"
import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { Tabs } from "@opencode/ui/tabs"
import { Loader } from "@opencode/ui/loader"
import { TruncatedText } from "@opencode/ui/truncated-text"
import { useLanguage } from "@/runtime/i18n/language"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useMcpToggle } from "@/providers/connect/mcp"
import { DialogMcp } from "@/providers/connect/mcp-dialog"
import { SettingsList } from "@/settings/list"
import { configuredLanguageServers } from "@/settings/workspaces/project-lsp"
import type { SettingsView } from "@/settings/surface"
import { SettingsPageHeader } from "@/settings/page-header"
import "@/settings/settings.css"
import "@/shell/search-list.css"

const statusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  disabled: "mcp.status.disabled",
} as const

export const SettingsExtensions: Component<{
  directory?: string
  subtab?: SettingsView["subtab"]
  onSubtab: (value: SettingsView["subtab"]) => void
  headerAction?: JSX.Element
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const data = useData()
  const dialog = useDialog()
  // MCP connections are per Location, so read and toggle them where the active session runs, as the TUI does. The
  // names come from the default Location so this page lists only the servers available to all projects.
  const location = () => (props.directory ? { directory: props.directory } : data.location.default())
  const toggleMcp = useMcpToggle(() => props.directory)

  // The synced lists follow mcp.status.changed, so a finished sign-in shows up without a refetch.
  createEffect(() => {
    if (serverSdk.connection.status() !== "connected") return
    void data.location.mcp.server.sync(data.location.default()).catch(() => undefined)

    if (props.directory) void data.location.mcp.server.sync(location()).catch(() => undefined)
  })

  const mcps = createMemo(() => {
    const active = data.location.mcp.server.list(location())

    return (data.location.mcp.server.list(data.location.default()) ?? [])
      .map((server) => active?.find((item) => item.name === server.name) ?? server)
      .toSorted((a, b) => a.name.localeCompare(b.name))
  })

  const toggle = (name: string) => {
    if (toggleMcp.isPending) return
    toggleMcp.mutate(name)
  }

  // Language servers come from the same document the MCP note points at, and they are read-only here: enabling or
  // disabling one belongs to opencode.json, so this tab reports what is configured instead of editing it.
  const languageServers = createQuery(() => ({
    queryKey: [serverSdk.scope, "settings-extensions-language-servers"],
    enabled: serverSdk.connection.status() === "connected",
    queryFn: () => serverSdk.api.config.get({ location: undefined }),
  }))

  const configuredLanguageServersState = createMemo(() =>
    configuredLanguageServers(
      languageServers.isPending || languageServers.isError ? [] : (languageServers.data ?? []),
    ),
  )

  onCleanup(serverSdk.event.on("config.updated", () => void languageServers.refetch()))

  function SectionHeading(props: { description: string }) {
    return (
      <div class="flex items-center justify-between">
        <span class="settings-extension-heading">{props.description}</span>
        <span class="settings-extension-note">{language.t("settings.extensions.manageConfig")}</span>
      </div>
    )
  }

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.tab.extensions")}
        description={language.t("settings.extensions.description")}
        actions={props.headerAction}
      />

      <div class="settings-tab-body">
        <Tabs
          variant="pill"
          // A stored `plugins` or `skills` subtab predates these two tabs; the MCP tab is the honest fallback.
          value={props.subtab === "lsps" ? "lsps" : "mcps"}
          onChange={(value) => {
            if (value === "mcps" || value === "lsps") props.onSubtab(value)
          }}
          class="settings-extensions-tabs settings-subtabs"
        >
          <Tabs.List>
            <Tabs.Trigger value="mcps">{language.t("settings.extensions.tab.mcps")}</Tabs.Trigger>
            <Tabs.Trigger value="lsps">{language.t("project.settings.extensions.tab.lsps")}</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="mcps">
            <div class="settings-section">
              <SectionHeading description={language.t("settings.extensions.availableAll")} />
              <SettingsList variant="catalog">
                <For each={mcps()}>
                  {(item) => {
                    const busy = () => {
                      const target = toggleMcp.isPending ? toggleMcp.variables : undefined

                      return (Predicate.isString(target) ? target : target?.name) === item.name
                    }

                    // The dot shows the status, as in the MCPs dialog; the words stay for assistive technology.
                    const label = () =>
                      item.status.status === "pending" ? undefined : language.t(statusLabels[item.status.status])

                    return (
                      <div class="settings-extension-row settings-mcp-row" data-status={item.status.status}>
                        <div class="settings-extension-lead">
                          <span class="settings-mcp-status">
                            <span class="mcp-status-dot" data-status={item.status.status} aria-hidden="true" />
                          </span>
                          <TruncatedText text={item.name} class="settings-extension-name" />
                        </div>
                        <div class="settings-extension-trailing">
                          <Show when={item.status.status === "failed"}>
                            <Button
                              size="small"
                              variant="ghost-muted"
                              class="mcp-status-action"
                              aria-label={language.t("dialog.mcp.error.viewLabel", { name: item.name })}
                              onClick={() =>
                                dialog.show(() => <DialogMcp directory={location().directory} server={item.name} />)
                              }
                            >
                              {language.t("dialog.mcp.error.view")}
                            </Button>
                          </Show>
                          <Show
                            when={item.status.status === "needs_auth" && item.integrationID}
                            fallback={
                              <Switch
                                checked={item.status.status !== "disabled"}
                                disabled={item.status.status === "pending" || busy()}
                                description={label()}
                                class="[&_[data-slot=switch-description]]:sr-only"
                                onChange={(enabled) => {
                                  if (toggleMcp.isPending) return
                                  toggleMcp.mutate({ name: item.name, enabled })
                                }}
                              >
                                <span class="sr-only">{item.name}</span>
                              </Switch>
                            }
                          >
                            <Button
                              size="small"
                              variant="ghost-muted"
                              class="mcp-status-action"
                              disabled={busy()}
                              aria-busy={busy()}
                              aria-label={language.t("dialog.mcp.signIn.open", { name: item.name })}
                              onClick={() => toggle(item.name)}
                            >
                              {language.t(busy() ? "dialog.mcp.signingIn" : "dialog.mcp.signIn")}
                            </Button>
                          </Show>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </SettingsList>
            </div>
          </Tabs.Content>

          <Tabs.Content value="lsps">
            <div class="settings-section">
              <SectionHeading description={language.t("project.settings.extensions.lsp.description")} />
              <Show
                when={!languageServers.isPending && !languageServers.isError}
                fallback={
                  <Show
                    when={languageServers.isError}
                    fallback={
                      <div class="settings-extension-state">
                        <Loader />
                        <span>{language.t("common.loading")}</span>
                      </div>
                    }
                  >
                    <div class="settings-extension-state">
                      <span>{language.t("settings.providers.config.failed")}</span>
                      <Button size="small" variant="ghost" onClick={() => void languageServers.refetch()}>
                        {language.t("common.retry")}
                      </Button>
                    </div>
                  </Show>
                }
              >
                <SettingsList variant="catalog">
                  <Show
                    when={configuredLanguageServersState().servers.length > 0}
                    fallback={
                      <p class="settings-extension-state">
                        {language.t(
                          configuredLanguageServersState().disabled
                            ? "project.settings.extensions.lsp.disabled.title"
                            : "project.settings.extensions.lsp.empty.title",
                        )}
                      </p>
                    }
                  >
                    <For each={configuredLanguageServersState().servers}>
                      {(server) => (
                        <div class="settings-extension-row" data-status={server.disabled ? "disabled" : "connected"}>
                          <div class="settings-extension-lead">
                            <span class="settings-mcp-status">
                              <span
                                class="mcp-status-dot"
                                data-status={server.disabled ? "disabled" : "connected"}
                                aria-hidden="true"
                              />
                            </span>
                            <TruncatedText text={server.name} class="settings-extension-name" />
                          </div>
                          <div class="settings-extension-trailing">
                            <span class="settings-extension-note">
                              {server.disabled
                                ? language.t("project.settings.extensions.lsp.status.disabled")
                                : server.extensions.length > 0
                                  ? server.extensions.join(", ")
                                  : language.t("project.settings.extensions.lsp.status.enabled")}
                            </span>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </SettingsList>
              </Show>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </>
  )
}
