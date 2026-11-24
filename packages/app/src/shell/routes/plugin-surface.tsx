import { useNavigate, useParams } from "@solidjs/router"
import { createMemo, createSignal, Show } from "solid-js"
import { Button } from "@aicraft/ui/button"
import { Icon } from "@aicraft/ui/icon"
import { Loader } from "@aicraft/ui/loader"
import { MainSurface } from "@aicraft/plugin/gui"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { findMainSurface, type MainSurfaceEntry } from "@/runtime/plugin/main-surface"
import { Contribution } from "@/runtime/plugin/render"
import { ModulePage } from "@/shell/module-page"
import { PagePanel } from "@/shell/page"

/**
 * One plugin's main surface at `/plugins/<plugin>/<surface>`. The page is the plugin's own content area, and it
 * shows the unavailable page while the plugin loads, cannot render it, or is turned off and no longer contributes it.
 */
export function PluginSurfaceScreen() {
  const params = useParams<{ plugin: string; surface: string }>()
  const host = usePluginHost()

  const plugin = () => decodeURIComponent(params.plugin ?? "")
  const id = () => decodeURIComponent(params.surface ?? "")

  const surface = createMemo(() => findMainSurface(host.items(MainSurface), plugin(), id()))

  return (
    <Show
      when={surface()}
      keyed
      fallback={
        <Show when={host.status(plugin()) === "loading"} fallback={<Unavailable />}>
          <Loading />
        </Show>
      }
    >
      {(entry) => (
        <ModulePage label={entry.value.title} full>
          <Surface entry={entry} />
        </ModulePage>
      )}
    </Show>
  )
}

/** Renders the contribution once; a throw replaces it with the unavailable page, as `Contribution` records it. */
function Surface(props: { entry: MainSurfaceEntry }) {
  const [failed, setFailed] = createSignal(false)

  return (
    <Show when={!failed()} fallback={<Unavailable />}>
      <Contribution plugin={props.entry.plugin} failed={() => setFailed(true)}>
        {() => props.entry.value.render()}
      </Contribution>
    </Show>
  )
}

function Loading() {
  return (
    <PagePanel>
      <div class="flex min-h-0 flex-1 items-center justify-center">
        <Loader class="text-[var(--color-icon-secondary)]" />
      </div>
    </PagePanel>
  )
}

function Unavailable() {
  const language = useLanguage()
  const navigate = useNavigate()

  return (
    <PagePanel>
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span class="flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-v2-background-bg-layer-02 text-v2-text-text-faint">
          <Icon name="rail-compass" />
        </span>
        <p class="text-[13px] leading-5 font-medium">{language.t("replica.surface.unavailable.title")}</p>
        <p class="max-w-80 text-[12px] leading-[var(--line-height-base)] text-v2-text-text-muted">
          {language.t("replica.surface.unavailable.description")}
        </p>
        <Button size="small" variant="neutral" onClick={() => navigate("/")}>
          {language.t("replica.surface.unavailable.action")}
        </Button>
      </div>
    </PagePanel>
  )
}
