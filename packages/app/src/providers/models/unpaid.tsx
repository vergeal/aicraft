import { DialogBody, DialogHeader, DialogTitle, Dialog } from "@opencode/ui/dialog"
import { Badge } from "@opencode/ui/badge"
import { Icon } from "@opencode/ui/icon"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { ProviderModelIcon } from "@/providers/models/provider-group"
import { Tooltip } from "@opencode/ui/tooltip"
import { useDialog } from "@opencode/ui/context/dialog"
import { createMemo, onCleanup, onMount, type Component, For, Show } from "solid-js"
import { useLocal, type ModelSelection } from "@/providers/models/selection"
import { isFreeModel } from "@/providers/models/models"
import { useIntegrations } from "@/providers/catalog/integrations"
import { decode64 } from "@/runtime/persistence/base64"
import { useLanguage } from "@/runtime/i18n/language"
import { ModelTooltip } from "./tooltip"

type ModelState = ModelSelection

const featuredProviders = ["opencode-go", "opencode", "openai", "anthropic", "google", "github-copilot"]

const displayModelName = (name: string) => name.replace(/\s+(?:\(free\)|free)$/i, "")

export const DialogSelectModelUnpaid: Component<{ model?: ModelState }> = (props) => {
  const local = useLocal()
  const model = props.model ?? local.model
  const dialog = useDialog()
  const directory = () => decode64(local.slug())
  const integrations = useIntegrations(directory)
  const language = useLanguage()
  const modelKey = (item: ReturnType<ModelState["list"]>[number]) => `${item.provider.id}:${item.id}`

  const currentKey = createMemo(() => {
    const c = model.current()

    return c ? `${c.provider.id}:${c.id}` : undefined
  })

  const providerName = (provider: { id: string; name: string }) =>
    provider.id === "opencode" ? language.t("provider.connect.opencode.name") : provider.name

  const freeModels = createMemo(() => model.list().filter(isFreeModel))

  const openProviders = (provider?: string) => {
    void import("@/providers/connect/dialog").then((x) => {
      const controller = x.useProviderConnectController()
      controller.select(provider)
      void dialog.show(() => (
        <x.DialogConnectProvider controller={controller} directory={directory()} selection={model} />
      ))
    })
  }

  const selectModel = (item: ReturnType<ModelState["list"]>[number]) => {
    model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
    dialog.close()
  }

  // Focus starts on the dialog itself, outside the list, so listen at the
  // document level while the dialog is mounted instead of on the list container.
  let listEl: HTMLDivElement | undefined
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return

      if (!listEl) return
      const buttons = Array.from(listEl.querySelectorAll<HTMLButtonElement>("button"))

      if (buttons.length === 0) return
      const index = buttons.findIndex((button) => button === document.activeElement)

      const next =
        index < 0 ? (e.key === "ArrowDown" ? 0 : buttons.length - 1) : index + (e.key === "ArrowDown" ? 1 : -1)

      buttons[(next + buttons.length) % buttons.length]?.focus()
      e.preventDefault()
    }

    document.addEventListener("keydown", handleKeyDown)
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown))
  })

  return (
    <Dialog size="normal" fit>
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitle>{language.t("dialog.model.select.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody flush class="min-h-0 flex-none">
        <MenuScroll viewportClass="px-4 pb-4">
          <div ref={listEl} class="flex min-h-0 flex-col">
            <div data-section="free-models" class="flex w-full flex-col gap-0.5 pt-1">
              <div class="flex h-5 items-center px-2 text-[12px] font-medium leading-5 text-v2-text-text-muted">
                {language.t("dialog.model.unpaid.freeModels.title")}
              </div>
              <For each={freeModels()}>
                {(item) => (
                  <Tooltip
                    class="w-full"
                    placement="right-start"
                    gutter={6}
                    openDelay={0}
                    contentStyle={{ "font-family": "var(--v2-font-family-sans)" }}
                    value={
                      <ModelTooltip
                        model={{ ...item, name: displayModelName(item.name) }}
                        latest={item.latest}
                        free={isFreeModel(item)}
                        v2
                      />
                    }
                  >
                    <button
                      type="button"
                      class="flex h-9 w-full scroll-my-4 flex-row items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium leading-[var(--line-height-compact)] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                      onClick={() => selectModel(item)}
                    >
                      <span class="min-w-0 truncate">{displayModelName(item.name)}</span>
                      <Badge class="shrink-0">{language.t("model.tag.free")}</Badge>
                      <Show when={item.latest}>
                        <Badge class="shrink-0">{language.t("model.tag.latest")}</Badge>
                      </Show>
                      <Show when={currentKey() === modelKey(item)}>
                        <Icon name="check" class="ms-auto size-4 shrink-0 text-v2-icon-icon-base" />
                      </Show>
                    </button>
                  </Tooltip>
                )}
              </For>
            </div>

            <div class="mt-2 flex w-full flex-col rounded-xl border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-layer-02 p-2">
              <div class="flex h-5 items-center px-2 text-[12px] font-medium leading-5 text-v2-text-text-muted">
                {language.t("dialog.model.unpaid.addMore.title")}
              </div>
              <div class="mt-1 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                <For
                  each={integrations
                    .list()
                    .filter((provider) => featuredProviders.includes(provider.id))
                    .sort((a, b) => featuredProviders.indexOf(a.id) - featuredProviders.indexOf(b.id))}
                >
                  {(provider) => (
                    <button
                      type="button"
                      data-provider-id={provider.id}
                      class="flex min-h-9 w-full scroll-my-4 flex-row items-center gap-2 rounded-lg border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-base px-3 py-2 text-left text-[13px] font-medium leading-[var(--line-height-compact)] text-v2-text-text-base hover:bg-v2-background-bg-layer-01 focus-visible:bg-v2-background-bg-layer-01 focus-visible:outline-none"
                      onClick={() => openProviders(provider.id)}
                    >
                      <ProviderModelIcon
                        provider={{ id: provider.id, name: providerName(provider) }}
                        class="shrink-0 text-v2-icon-icon-base"
                      />
                      <span class="flex min-w-0 flex-col">
                        <span class="truncate">{providerName(provider)}</span>
                        <Show when={provider.id === "opencode" || provider.id === "opencode-go"}>
                          <span class="truncate text-[12px] font-normal leading-4 text-v2-text-text-muted">
                            {language.t(
                              provider.id === "opencode"
                                ? "dialog.provider.opencode.tagline"
                                : "dialog.provider.opencodeGo.tagline",
                            )}
                          </span>
                        </Show>
                      </span>
                    </button>
                  )}
                </For>
                <button
                  type="button"
                  class="col-span-full flex h-8 w-full scroll-my-4 items-center justify-start rounded-lg px-2 text-left text-[13px] font-normal leading-[var(--line-height-compact)] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                  onClick={() => openProviders()}
                >
                  {language.t("dialog.model.unpaid.viewMoreProviders")}
                </button>
              </div>
            </div>
          </div>
        </MenuScroll>
      </DialogBody>
    </Dialog>
  )
}
