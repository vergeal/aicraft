import { createEffect, createResource, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode/ui/context/dialog"
import { Tooltip } from "@opencode/ui/tooltip"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useCommand } from "@/shell/commands/command"
import { showToast } from "@/shell/notifications/toast"
import legal from "./legal.svg"
import { AnimatedWordmark } from "./animated-wordmark"
import { FALLBACK_OTHER_CONTRIBUTORS, loadOtherContributorCount } from "./contributors"

const writers = [
  "thdxr",
  "adamdotdev",
  "rekram1-node",
  "kitlangton",
  "iamdavidhill",
  "jayair",
  "fwang",
  "brendonovich",
  "nexxeln",
  "hona",
  "kommander",
  "jlongster",
  "vimtor",
  "r44vcorp",
  "simonklee",
  "arvsrn",
] as const

const illustrators = ["usrnk1", "ludvigrask_", "arvsrn", "iamdavidhill"] as const

export function SettingsAbout(props: { active: boolean }) {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const command = useCommand()
  const [copy, setCopy] = createStore({ pending: false, copied: false, forceCopied: false })
  const version = () => platform.version ?? language.t("settings.about.devVersion")

  const [otherContributors] = createResource(
    () => props.active || undefined,
    () => loadOtherContributorCount(platform.fetch ?? fetch),
    { initialValue: FALLBACK_OTHER_CONTRIBUTORS },
  )

  createEffect(() => {
    if (!copy.copied) return

    const close = setTimeout(() => setCopy("forceCopied", false), 2000)
    const reset = setTimeout(() => setCopy("copied", false), 2120)

    onCleanup(() => {
      clearTimeout(close)
      clearTimeout(reset)
    })
  })

  const copyVersion = async () => {
    if (copy.pending) return

    setCopy({ pending: true, copied: false, forceCopied: false })

    // The clipboard copies the raw version, so it can be pasted into an issue as is. On a plain-HTTP LAN
    // origin `navigator.clipboard` is undefined, so the write can be missing rather than failing; report
    // that through the same toast. Wrapping the call keeps a synchronous throw inside the chain.
    await Promise.resolve()
      .then(() => {
        const written = platform.writeClipboardText?.(version()) ?? navigator.clipboard?.writeText(version())

        if (!written) throw new Error("clipboard unavailable")

        return written
      })
      .then(() => setCopy({ copied: true, forceCopied: true }))
      .catch(() =>
        showToast({
          variant: "error",
          title: language.t("settings.about.copyVersionFailed"),
        }),
      )
      .finally(() => setCopy("pending", false))
  }

  const credit = (name: string) => (
    <bdi dir="ltr">
      <ExternalLink href={profile(name)}>{name}</ExternalLink>
    </bdi>
  )

  const writerCredits = () => [
    ...writers.map(credit),
    <ExternalLink href="https://github.com/anomalyco/opencode/graphs/contributors">
      {language.plural("settings.about.otherContributor", otherContributors.latest, {
        count: otherContributors.latest,
      })}
    </ExternalLink>,
  ]

  const showNotices = async () => {
    // The license texts load only when someone reads them.
    const loaded = await import("./notices/dialog").catch(() => undefined)

    if (!loaded) {
      showToast({ variant: "error", title: language.t("settings.about.notices.loadFailed") })

      return
    }

    void dialog.show(() => <loaded.default />)
  }

  return (
    <div class="settings-about-content">
      <div class="settings-about-intro">
        <div class="settings-about-version-line">
          <Tooltip
            value={language.t(copy.copied ? "common.copied" : "ui.message.copy")}
            placement="top"
            forceOpen={copy.forceCopied ? true : undefined}
          >
            <button
              type="button"
              class="settings-about-version disabled:opacity-60"
              disabled={copy.pending}
              aria-label={language.t("settings.about.copyVersion", { version: version() })}
              onClick={() => void copyVersion()}
            >
              <span>
                {language.rich("settings.about.version", {
                  version: <bdi dir="ltr">{version()}</bdi>,
                })}
              </span>
              {/* Without a copy glyph the pill reads as static text rather than a button. */}
              <Icon name="outline-copy" size="small" class="size-3 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip value={language.t("settings.about.checkUpdates")} placement="top">
            <button type="button" class="settings-about-link" onClick={() => command.trigger("updater.check")}>
              {language.t("settings.about.checkUpdates")}
            </button>
          </Tooltip>
        </div>
        <p>{language.t("settings.about.license")}</p>
      </div>

      <AnimatedWordmark active={props.active} />

      <div class="settings-about-credits">
        <p>{language.rich("settings.about.writtenByNames", { names: language.list(writerCredits()) })}</p>
        <p>
          {language.rich("settings.about.illustratedByNames", {
            names: language.list(illustrators.map(credit)),
          })}
        </p>
      </div>

      <div class="settings-about-publication">
        <p>{language.t("settings.about.firstPublished")}</p>
        <p>{language.t("settings.about.firstIllustrated")}</p>
      </div>

      <p class="settings-about-faint">
        <ExternalLink href="https://opencode.ai">
          <bdi dir="ltr">{language.t("settings.about.website")}</bdi>
        </ExternalLink>
      </p>

      <div class="settings-about-details">
        <p>{language.t("settings.about.description")}</p>
        <p>{language.t("settings.about.trademark")}</p>
        <p>{language.t("settings.about.typeset")}</p>
        <p>
          <button type="button" class="settings-about-link" onClick={() => void showNotices()}>
            {language.t("settings.about.notices.title")}
          </button>
        </p>
      </div>

      <p>{language.t("settings.about.tagline")}</p>
      <img class="settings-about-legal" src={legal} alt="" />
      <div class="settings-about-copyright">
        <p>{language.t("settings.about.copyright")}</p>
        {/* Masked rather than drawn: the brush's own ink is a fixed grey, which reads on one scheme only. */}
        <span class="settings-about-anomaly-brush" aria-hidden="true" />
      </div>
    </div>
  )
}

function profile(name: string) {
  if (name === "r44vcorp") return "https://github.com/R44VC0RP"

  if (name === "ludvigrask_") return "https://x.com/ludvigrask_"

  return `https://github.com/${name}`
}
