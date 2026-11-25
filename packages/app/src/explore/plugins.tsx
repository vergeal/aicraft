import type { PluginInfo } from "@aicraft/client"
import type { SkillInfo } from "@aicraft/client/promise"
import type { Catalog } from "@aicraft/schema/catalog"
import { Button } from "@aicraft/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@aicraft/ui/dialog"
import { Progress } from "@aicraft/ui/progress"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Icon } from "@aicraft/ui/icon"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { pluginLabel } from "@/providers/catalog/plugin"
import { useServerSDK } from "@/runtime/server/client"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"
import { ExternalLink } from "@/runtime/platform/external-link"
import { usePlatform } from "@/runtime/platform/platform"
import "@/settings/settings.css"
import "./explore.css"
import type { CatalogPlugin } from "./catalog"

const featureLabels = {
  server: "explore.plugins.feature.server",
  tui: "explore.plugins.feature.tui",
  rpc: "explore.plugins.feature.rpc",
  gui: "explore.plugins.feature.gui",
} as const

const featureKeys: Array<keyof typeof featureLabels> = ["server", "tui", "rpc", "gui"]

const featuresOf = (plugin: PluginInfo) => featureKeys.filter((key) => plugin.features[key])

/** The interpreter environment a plugin's manifest declares, as the host reports it. */
const runtimeLabels = {
  ready: "explore.plugins.runtime.ready",
  preparing: "explore.plugins.runtime.preparing",
  failed: "explore.plugins.runtime.failed",
} as const

/** What a preparing environment is doing right now. A ready or failed one has no step to name. */
const phaseLabels = {
  runtime: "explore.plugins.runtime.phase.runtime",
  dependencies: "explore.plugins.runtime.phase.dependencies",
} as const

export const categoryLabels = {
  automation: "explore.plugins.category.automation",
  productivity: "explore.plugins.category.productivity",
  design: "explore.plugins.category.design",
  "developer-tools": "explore.plugins.category.developer-tools",
  data: "explore.plugins.category.data",
} as const satisfies Record<Catalog.Category, string>

const sourceDetail = (plugin: PluginInfo) => {
  if (plugin.source.type === "package") return plugin.source.target

  if (plugin.source.type === "local") return plugin.source.path

  return undefined
}

/** The installed plugin's own page: its state, what it contributes, and the actions on it. */
export function InstalledPluginDetail(props: {
  plugin: PluginInfo
  /** Every known skill; the ones carrying this plugin's id are what the plugin contributes at runtime. */
  skills?: readonly SkillInfo[]
  onUninstall?: () => void
  onRetry?: () => Promise<void>
  onRuntimeRetry?: () => Promise<void>
}) {
  const language = useLanguage()

  const failed = () => (props.plugin.state.status === "failed" ? props.plugin.state : undefined)

  // The runtime list is the source of truth (a plugin may register skills its manifest never declares); the
  // manifest's own skills stand in while the plugin has not registered any, such as after a failed load.
  const contributedSkills = (): ReadonlyArray<{ id: string; name: string; description?: string }> => {
    const runtime = props.plugin.id ? (props.skills ?? []).filter((skill) => skill.plugin === props.plugin.id) : []

    if (runtime.length > 0) return runtime

    return props.plugin.display?.skills ?? []
  }

  return (
    <div class="explore-detail">
      <dl class="explore-catalog-facts">
        <Show when={props.plugin.id && !props.plugin.display}>
          {(id) => (
            <div>
              <dt>{language.t("explore.plugins.detail.id")}</dt>
              <dd>
                <code dir="ltr">{id()}</code>
              </dd>
            </div>
          )}
        </Show>
        <Show when={sourceDetail(props.plugin)}>
          {(target) => (
            <div>
              <dt>{language.t("explore.plugins.discover.repository")}</dt>
              <dd>
                <span dir="ltr" title={target()}>
                  {target()}
                </span>
              </dd>
            </div>
          )}
        </Show>
        <Show when={!props.plugin.display && featuresOf(props.plugin).length > 0}>
          <div>
            <dt>{language.t("explore.plugins.detail.features")}</dt>
            <dd>
              {featuresOf(props.plugin).map((feature) => (
                <span class="explore-catalog-feature">{language.t(featureLabels[feature])}</span>
              ))}
            </dd>
          </div>
        </Show>
        <Show when={props.plugin.runtime}>
          {(runtime) => (
            <div>
              <dt>{language.t("explore.plugins.detail.runtime")}</dt>
              <dd>
                <Show
                  when={runtime().status === "preparing" && runtime().phase}
                  fallback={language.t(runtimeLabels[runtime().status])}
                >
                  {(phase) => language.t(phaseLabels[phase()])}
                </Show>
              </dd>
            </div>
          )}
        </Show>
      </dl>

      <Show when={props.plugin.display?.description}>
        {(description) => <p class="explore-catalog-about">{description()}</p>}
      </Show>

      <Show when={contributedSkills().length}>
        {(count) => (
          <section class="explore-catalog-section">
            <h2 class="explore-catalog-section-title">
              {language.t("explore.plugins.detail.skills")}
              <span class="explore-catalog-section-count">{count()}</span>
            </h2>
            <ul class="explore-catalog-list">
              <For each={contributedSkills()}>
                {(skill) => (
                  <li class="explore-catalog-list-row explore-catalog-skill">
                    <span class="explore-catalog-list-icon">
                      <Icon name="post-skill" />
                    </span>
                    <span class="explore-catalog-skill-copy">
                      <span class="explore-catalog-list-name">{skill.name}</span>
                      <span class="explore-catalog-skill-description">{skill.description}</span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </Show>

      <Show when={props.plugin.display?.tools?.length}>
        {(count) => (
          <section class="explore-catalog-section">
            <h2 class="explore-catalog-section-title">
              {language.t("explore.plugins.detail.tools")}
              <span class="explore-catalog-section-count">{count()}</span>
            </h2>
            <ul class="explore-catalog-list">
              <For each={props.plugin.display?.tools}>
                {(tool) => (
                  <li class="explore-catalog-list-row">
                    <span class="explore-catalog-list-icon">
                      <Icon name="outline-pair" />
                    </span>
                    <code class="explore-catalog-list-name" dir="ltr">
                      {tool}
                    </code>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </Show>

      <Show when={failed()}>
        {(failure) => <PluginFailure error={failure().error} reference={failure().ref} reason={failure().reason} />}
      </Show>

      <Show when={props.plugin.runtime?.status === "failed" ? props.plugin.runtime : undefined}>
        {(runtime) => (
          <>
            <p class="explore-catalog-about">{language.t("explore.plugins.runtime.failedHint")}</p>
            <PluginFailure
              error={runtime().error ?? language.t("explore.plugins.runtime.retryFailed")}
              reference={runtime().ref}
            />
          </>
        )}
      </Show>

      <Show when={props.plugin.runtime?.status === "failed" ? props.plugin.id : undefined}>
        {(id) => <PluginRuntimeRetry retry={() => props.onRuntimeRetry?.() ?? Promise.resolve()} />}
      </Show>

      <Show when={!!failed() && props.plugin.source.type !== "builtin" && !!props.plugin.id}>
        <PluginRetry retry={() => props.onRetry?.() ?? Promise.resolve()} />
      </Show>

      <div class="module-card-foot">
        <Show when={props.plugin.source.type !== "builtin"}>
          <Button size="small" variant="ghost-danger" icon="trash" onClick={() => props.onUninstall?.()}>
            {language.t("explore.plugins.uninstall")}
          </Button>
        </Show>
      </div>
    </div>
  )
}

/** A published plugin's own page: what it is and the install action. */
export function CatalogPluginDetail(props: { entry: CatalogPlugin; onInstall?: () => void }) {
  const language = useLanguage()

  return (
    <div class="explore-detail">
      <p class="explore-catalog-about">{props.entry.details ?? props.entry.description}</p>

      <dl class="explore-catalog-facts">
        <Show when={props.entry.versions?.length ? props.entry.versions : undefined}>
          {(versions) => (
            <div>
              <dt>{language.t("explore.plugins.facts.version")}</dt>
              <dd>
                <span dir="ltr">v{versions()[0]!.version}</span>
                <Show when={versions().length > 1}>
                  <span class="explore-catalog-version-count">
                    {" · "}
                    {language.t("explore.plugins.discover.version.count", { count: versions().length })}
                  </span>
                </Show>
              </dd>
            </div>
          )}
        </Show>
        <div>
          <dt>
            {language.t(
              props.entry.integrated
                ? "explore.plugins.discover.integration"
                : props.entry.bundle
                  ? "explore.plugins.discover.local"
                  : "explore.plugins.discover.package",
            )}
          </dt>
          <dd>
            {props.entry.integrated ? (
              language.t("explore.plugins.install.integrated")
            ) : (
              <code dir="ltr">
                {props.entry.bundle ? `~/.distribution/plugins/${props.entry.id}` : props.entry.package}
              </code>
            )}
          </dd>
        </div>
        <Show when={props.entry.repository}>
          <div>
            <dt>{language.t("explore.plugins.discover.repository")}</dt>
            <dd>
              <ExternalLink href={props.entry.repository}>{props.entry.repository}</ExternalLink>
            </dd>
          </div>
        </Show>
      </dl>

      <p class="explore-note">
        {language.t(
          props.entry.integrated
            ? "explore.plugins.install.integrated.note"
            : props.entry.bundle
              ? "explore.plugins.install.bundle.note"
              : "explore.plugins.install.manual",
        )}
      </p>

      <div class="module-card-foot">
        <Button variant="contrast" size="small" icon="plus" onClick={() => props.onInstall?.()}>
          {language.t("explore.plugins.install")}
        </Button>
      </div>
    </div>
  )
}

/**
 * Why a plugin failed to load. The summary comes from the structured `reason` when the server sends one, so the app
 * never shows English written by the server; the full error stays folded and scrolls inside a bounded box. The
 * reference and the log export are what a bug report needs.
 */
function PluginFailure(props: {
  error: string
  reference?: string
  reason?: Extract<PluginInfo["state"], { status: "failed" }>["reason"]
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const [state, setState] = createStore<{ exportError: string }>({ exportError: "" })

  const summary = () => {
    const reason = props.reason

    if (reason?.kind === "transform-failed")
      return language.t("explore.plugins.error.reason.transformFailed", { state: reason.state })

    if (reason?.kind === "activation-timeout")
      return language.t("explore.plugins.error.reason.activationTimeout", { seconds: reason.seconds })

    if (reason?.kind === "load-timeout")
      return language.t("explore.plugins.error.reason.loadTimeout", { seconds: reason.seconds })

    if (reason?.kind === "load-failed") return language.t("explore.plugins.error.reason.loadFailed")

    // A stack starts with the message; an untranslated server error is a single fixed sentence.
    return (
      props.error
        .split("\n")
        .find((line) => line.trim().length > 0)
        ?.trim() || props.error
    )
  }

  const copyReference = async () => {
    if (!props.reference) return

    try {
      await (platform.writeClipboardText?.(props.reference) ?? navigator.clipboard.writeText(props.reference))
      showToast({ variant: "success", title: language.t("explore.plugins.error.copied") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.skills.copyFailed") })
    }
  }

  const exportLogs = async () => {
    if (!platform.exportDebugLogs) return

    setState("exportError", "")

    try {
      const exported = await platform.exportDebugLogs()
      showToast({ variant: "success", title: language.t("explore.plugins.error.exportLogs.success") })
      await platform.revealPath?.(exported)
    } catch (error) {
      console.error("plugin log export failed", error)
      const message = error instanceof Error ? error.message : String(error)
      setState("exportError", message || language.t("explore.plugins.error.exportLogs.failed"))
    }
  }

  return (
    <div class="explore-plugin-error">
      <p class="explore-plugin-error-summary" role="alert">
        {summary()}
      </p>

      <Show when={props.error.trim() !== summary()}>
        <details class="explore-plugin-error-details">
          <summary>{language.t("explore.plugins.error.details")}</summary>
          <pre class="explore-plugin-error-pre" dir="ltr">
            {props.error}
          </pre>
        </details>
      </Show>

      <Show when={props.reference}>
        {(reference) => (
          <div class="explore-plugin-error-row">
            <code class="explore-plugin-error-ref" dir="ltr">
              {reference()}
            </code>
            <Button size="small" variant="ghost-muted" onClick={() => void copyReference()}>
              {language.t("explore.plugins.error.copyRef")}
            </Button>
          </div>
        )}
      </Show>

      <Show when={platform.exportDebugLogs}>
        <div>
          <Button size="small" variant="ghost-muted" onClick={() => void exportLogs()}>
            {language.t("explore.plugins.error.exportLogs")}
          </Button>
        </div>
        <Show when={state.exportError}>
          {(message) => (
            <p class="explore-plugin-error-export" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </Show>
    </div>
  )
}

/**
 * Retries a failed plugin through the server's reload endpoint. The endpoint clears the target's load backoff and
 * asks the supervisor to activate again, so this button is the manual recovery path when the backoff is still open.
 */
function PluginRetry(props: { retry: () => Promise<void> }) {
  const language = useLanguage()
  const [state, setState] = createStore<{ busy: boolean; error: string }>({ busy: false, error: "" })

  const retry = async () => {
    if (state.busy) return

    setState({ busy: true, error: "" })

    try {
      await props.retry()
      setState({ busy: false, error: "" })
    } catch (error) {
      console.error("plugin reload failed", error)
      const message = error instanceof Error ? error.message : String(error)
      setState({ busy: false, error: message || language.t("explore.plugins.error.retryFailed") })
    }
  }

  return (
    <div class="explore-plugin-retry">
      <Button
        size="small"
        variant={state.busy ? "loading" : "neutral"}
        disabled={state.busy}
        onClick={() => void retry()}
      >
        {language.t(state.busy ? "explore.plugins.error.retrying" : "explore.plugins.error.retry")}
      </Button>
      <Show when={state.error}>
        {(message) => (
          <p class="explore-plugin-error-export" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </div>
  )
}

/**
 * Prepares a plugin's interpreter environment again after it failed, without reloading the plugin itself. The server
 * replies as soon as preparation starts; the status change arrives through the plugin inventory like any other.
 */
function PluginRuntimeRetry(props: { retry: () => Promise<void> }) {
  const language = useLanguage()
  const [state, setState] = createStore<{ busy: boolean; error: string }>({ busy: false, error: "" })

  const retry = async () => {
    if (state.busy) return

    setState({ busy: true, error: "" })

    try {
      await props.retry()
      setState({ busy: false, error: "" })
    } catch (error) {
      console.error("plugin runtime retry failed", error)
      const message = error instanceof Error ? error.message : String(error)
      setState({ busy: false, error: message || language.t("explore.plugins.runtime.retryFailed") })
    }
  }

  return (
    <div class="explore-plugin-retry">
      <Button
        size="small"
        variant={state.busy ? "loading" : "neutral"}
        disabled={state.busy}
        onClick={() => void retry()}
      >
        {language.t(state.busy ? "explore.plugins.runtime.retrying" : "explore.plugins.runtime.retry")}
      </Button>
      <Show when={state.error}>
        {(message) => (
          <p class="explore-plugin-error-export" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </div>
  )
}

/** Confirms before removing an installed plugin, because its tools and skills disappear with it. */ export function UninstallPluginDialog(props: {
  plugin: PluginInfo
  onUninstalled?: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const server = useServerSDK()
  const [state, setState] = createStore({ busy: false, error: "" })
  const name = () => pluginLabel(props.plugin)

  const submit = async () => {
    if (state.busy) return

    // A plugin that never loaded may have reported no id. Fail visibly instead of leaving the button inert.
    if (!props.plugin.id) {
      setState({ busy: false, error: language.t("explore.plugins.uninstall.unknownId") })

      return
    }

    setState({ busy: true, error: "" })

    try {
      await server.api.experimental.plugin.uninstall({ id: props.plugin.id })
      dialog.close()
      props.onUninstalled?.()
      showToast({ variant: "success", title: language.t("explore.plugins.uninstall.success", { name: name() }) })
    } catch (error) {
      console.error("plugin uninstall failed", error)
      // The server's message names the real cause, so show it instead of a generic retry hint.
      const message = error instanceof Error ? error.message : String(error)
      setState({
        busy: false,
        error: unsupportedRoute(message)
          ? language.t("explore.plugins.unsupported")
          : message || language.t("explore.plugins.uninstall.failed"),
      })
    }
  }

  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("explore.plugins.uninstall.title")}
          description={language.t("explore.plugins.uninstall.description", { name: name() })}
        />
      </DialogHeader>

      <DialogBody flush class="explore-install-body">
        <Show when={state.busy}>
          <Progress indeterminate aria-label={language.t("explore.plugins.uninstall.installing")} />
        </Show>

        <Show when={state.error}>
          {(message) => (
            <p class="explore-form-error" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </DialogBody>

      <DialogFooter>
        <Button variant="neutral" disabled={state.busy} onClick={() => dialog.close()}>
          {language.t("explore.plugins.install.cancel")}
        </Button>
        <Button variant="ghost-danger" disabled={state.busy} aria-busy={state.busy} onClick={() => void submit()}>
          {language.t("explore.plugins.uninstall")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

/** A server built before this feature answers 404 for the route, which the user fixes by updating it. */
function unsupportedRoute(message: string) {
  return /\b404\b|not found/i.test(message)
}
