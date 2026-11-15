import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { useLanguage } from "@/runtime/i18n/language"
import { Match, Show, Switch } from "solid-js"
import { selectServerIndicator, type ServerHealth } from "@/runtime/server/health-machine"

export function ServerHealthIndicator(props: { health?: ServerHealth }) {
  const language = useLanguage()
  const indicator = () => selectServerIndicator(props.health)
  // The dot alone cannot carry the state: keep the same five outcomes readable without color or sight.

  const label = () => {
    switch (indicator()) {
      case "healthy":
        return language.t("server.status.healthy")
      case "unreachable":
        return language.t("server.status.unreachable")
      case "auth":
        return language.t("server.status.authentication")
      case "connecting":
        return language.t("server.status.connecting")
      case "incompatible":
        return language.t("server.status.incompatible")
      default:
        return language.t("server.status.unknown")
    }
  }

  return (
    <Switch
      fallback={
        <div
          role="status"
          aria-label={label()}
          title={label()}
          class="inline-flex h-[18px] w-4 shrink-0 self-start items-center justify-center"
        >
          <span
            classList={{
              "relative size-1.5 rounded-full": true,
              "bg-icon-success-base": indicator() === "healthy",
              "bg-icon-critical-base": indicator() === "unreachable",
              "border border-current bg-transparent text-v2-icon-icon-faint": indicator() === "unknown",
            }}
          >
            <Show when={indicator() === "unreachable"}>
              <span class="absolute inset-x-px top-1/2 h-px -translate-y-1/2 rounded-full bg-v2-background-bg-base" />
            </Show>
          </span>
        </div>
      }
    >
      <Match when={indicator() === "auth"}>
        <span
          role="status"
          aria-label={language.t("server.status.authentication")}
          title={language.t("server.status.authentication")}
          class="inline-flex h-[18px] w-4 shrink-0 self-start items-center justify-center text-v2-icon-icon-muted"
        >
          <Icon name="lock" size="small" class="shrink-0" />
        </span>
      </Match>
      <Match when={indicator() === "connecting"}>
        <span
          role="status"
          aria-label={language.t("server.status.connecting")}
          title={language.t("server.status.connecting")}
          class="inline-flex h-[18px] w-4 shrink-0 self-start items-center justify-center text-v2-icon-icon-muted"
        >
          <Loader class="size-3 shrink-0" />
        </span>
      </Match>
      <Match when={indicator() === "incompatible"}>
        <span
          role="status"
          aria-label={language.t("server.status.incompatible")}
          title={language.t("server.status.incompatible")}
          class="inline-flex h-[18px] w-4 shrink-0 self-start items-center justify-center"
        >
          <Icon name="warning" size="small" class="shrink-0 text-icon-warning-base" />
        </span>
      </Match>
    </Switch>
  )
}
