import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { Button } from "@aicraft/ui/button"
import { Popover } from "@aicraft/ui/popover"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Icon } from "@aicraft/ui/icon"
import { IconButton } from "@aicraft/ui/icon-button"
import { Keybind } from "@aicraft/ui/keybind"
import { Slash } from "@aicraft/ui/slash"
import { Tooltip } from "@aicraft/ui/tooltip"
import { ComposerEditor } from "./editor/editor"
import "./overlay.css"
import "./model-card.css"
import type { ComposerSelectControl } from "./editor/interaction"
import { ComposerVariantSlider } from "./editor/variant-slider"
import { ModelList, ModelSelectorDrawer } from "@/providers/models/select-dialog"
import { DialogSelectModelUnpaid } from "@/providers/models/unpaid"
import { formatKeybind, useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import type { ComposerModel } from "./model"
import type { ComposerModelLabel } from "./model-label"

export function Composer(props: {
  class?: string
  model: ComposerModel
  borderUnderlay?: boolean
  readOnly?: boolean
  suggestionBoundary?: () => HTMLElement | undefined
  /** Drawn above the editor inside the card: the empty state keeps its project and branch context in the frame. */
  context?: JSX.Element
}) {
  const dialog = useDialog()
  const command = useCommand()
  const language = useLanguage()

  const modelName = () => {
    const preview = props.model.model.preview

    if (preview) return preview.model
    const selection = props.model.model.selection
    const model = selection.current()

    if (model) return model.name
    const key = selection.key()

    if (key) return language.t("dialog.model.unavailable", { model: key.modelID })

    return language.t("dialog.model.select.title")
  }

  const modelLabel = () => {
    const preview = props.model.model.preview
    const label = preview ? preview.label : props.model.model.label

    if (label) return label

    return { provider: preview ? preview.provider : props.model.model.providerName, model: modelName() }
  }

  return (
    <div data-ui="composer" class="flex flex-col">
      <Show when={props.context}>
        {(context) => (
          <div data-slot="composer-context" class="shrink-0">
            {context()}
          </div>
        )}
      </Show>
      <ComposerEditor
        controller={props.model}
        borderUnderlay={props.borderUnderlay}
        readOnly={props.readOnly}
        class={props.class}
        modelControlsVisible={!props.model.model.loading || !!props.model.model.preview}
        attachKeybind={command.keybindParts("file.attach")}
        attachShortcut={command.keybind("file.attach")}
        exitShellKeybind={[formatKeybind("esc", language.t)]}
        suggestionBoundary={props.suggestionBoundary}
        modelControl={(variant) => (
          <ComposerModelControl
            loading={props.model.model.loading}
            preview={!!props.model.model.preview}
            paid={props.model.model.paid}
            title={language.t("command.model.choose")}
            variantTitle={language.t("ui.promptInput.chooseVariant")}
            keybind={command.keybindParts("model.choose")}
            model={props.model.model.selection}
            label={modelLabel()}
            variant={variant}
            onClose={props.model.restoreFocus}
            onUnpaidClick={() => dialog.show(() => <DialogSelectModelUnpaid model={props.model.model.selection} />)}
          />
        )}
      />
    </div>
  )
}

function ComposerModelControl(props: {
  loading: boolean
  preview: boolean
  paid: boolean
  title: string
  variantTitle: string
  keybind: string[]
  model: ComposerModel["model"]["selection"]
  label: ComposerModelLabel
  variant?: ComposerSelectControl
  onClose: () => void
  onUnpaidClick: () => void
}) {
  // A preview paints the chip in its resting state, and the loaded names replace it in place.
  const shouldAnimate = createMemo<boolean>((previous) => previous ?? (props.loading && !props.preview))
  const mobile = createMediaQuery("(max-width: 767px)")
  const language = useLanguage()
  const [store, setStore] = createStore<{ open: boolean; page: "main" | "models" }>({ open: false, page: "main" })
  const hasVariant = () => !!props.variant && props.variant.options().length > 1
  // A model without effort options has nothing to show on a first page, so the card opens straight on the list.
  const list = () => !hasVariant() || store.page === "models"

  const reveal = () => {
    if (!props.paid) return props.onUnpaidClick()
    setStore({ open: true, page: hasVariant() ? "main" : "models" })
  }

  // A previewed chip is visible before the catalog loads, so a click on it opens the card once loading finishes.
  const [deferred, setDeferred] = createSignal(false)

  createEffect(() => {
    if (props.loading || !deferred()) return
    setDeferred(false)
    reveal()
  })

  const variantLabel = () => {
    const control = props.variant

    if (!control || !hasVariant()) return
    const option = control.options().find((item) => item.id === control.current())

    return option?.label ?? control.current()
  }

  const content = () => (
    <>
      <span class="flex min-w-0 whitespace-nowrap leading-4">
        <Show when={props.label.provider}>
          {(name) => (
            <>
              <bdi class="min-w-0 shrink-[2] truncate text-v2-text-text-faint">{name()}</bdi>
              <Slash />
              <span class="sr-only">{" / "}</span>
            </>
          )}
        </Show>
        <bdi class="min-w-0 truncate">{props.label.model}</bdi>
      </span>
      <span class="-ml-0.5 -mr-1 flex shrink-0">
        <Icon name="chevron-down" />
      </span>
    </>
  )

  return (
    <Show when={!props.loading || props.preview}>
      <Tooltip
        inactive={mobile()}
        placement="top"
        value={
          <>
            {props.title}
            <Keybind keys={props.keybind} variant="neutral" />
          </>
        }
      >
        {/* While loading, the drawer would open on a catalog that isn't there yet, so the inert chip stands in. */}
        <Show
          when={mobile() && !props.loading}
          fallback={
            <Popover
              open={store.open}
              onOpenChange={(next) => {
                if (!next) return setStore("open", false)
                if (props.loading) return setDeferred(true)
                reveal()
              }}
              placement="top-start"
              gutter={6}
              triggerAs={Button}
              trigger={content()}
              triggerProps={{
                class: `me-1.5 min-w-0 max-w-[calc(100cqw-140px)] justify-start ![font-weight: 400] ${
                  shouldAnimate() ? "animate-in fade-in" : ""
                }`,
                style: { height: "28px" },
                variant: "ghost-muted",
                size: "normal",
                "data-action": "composer-model",
                "data-control-type": "popover",
                "aria-label": props.title,
                onMouseDown: (event: MouseEvent) => event.preventDefault(),
              }}
            >
              {/* The card resizes with its search; the height transition matches the branch card's list. */}
              <div class="overflow-hidden transition-[height] duration-[200ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] motion-reduce:transition-none">
                <div
                  ref={(element) =>
                    createResizeObserver(element, (rect) =>
                      element.parentElement?.style.setProperty("height", `${rect.height}px`),
                    )
                  }
                >
                  <div
                    data-slot="composer-model-panel"
                    class="flex w-[264px] flex-col"
                    classList={{ "gap-3 p-3": !list() }}
                  >
                    <Show
                      when={list()}
                      fallback={
                        <>
                          <Show when={hasVariant()}>
                            <span class="text-center text-[13px] font-[530] capitalize leading-5 text-v2-text-text-accent">
                              {variantLabel()}
                            </span>
                          </Show>
                          <button
                            type="button"
                            data-slot="composer-model-row"
                            class="flex h-7 w-full items-center gap-2 rounded-full px-1.5 text-[13px] leading-5 transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                            onClick={() => setStore("page", "models")}
                          >
                            {/* Mirrors the chevron's width so the label centers in the button itself, not in the space left of
                            the arrow. Without it the label sits 11px left of centre. */}
                            <span aria-hidden="true" class="w-3.5 shrink-0" />
                            <span class="flex min-w-0 flex-1 items-center justify-center">
                              <Show when={props.label.provider}>
                                {(name) => (
                                  <>
                                    <span class="shrink-0 text-v2-text-text-faint">{name()}</span>
                                    <Slash />
                                  </>
                                )}
                              </Show>
                              <span class="min-w-0 truncate text-v2-text-text-base">{props.label.model}</span>
                            </span>
                            <Icon name="chevron-right" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                          </button>
                          <Show when={hasVariant() && props.variant}>
                            {(control) => <ComposerVariantSlider control={control()} label={props.variantTitle} />}
                          </Show>
                        </>
                      }
                    >
                      <div class="flex h-8 shrink-0 items-center gap-1 px-1.5">
                        <Show when={hasVariant()}>
                          <IconButton
                            size="small"
                            variant="ghost-muted"
                            class="size-6 shrink-0"
                            icon={<Icon name="chevron-left" />}
                            aria-label={language.t("common.goBack")}
                            onMouseDown={(event: MouseEvent) => event.preventDefault()}
                            onClick={() => setStore("page", "main")}
                          />
                        </Show>
                        <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-v2-text-text-muted">
                          {props.title}
                        </span>
                      </div>
                      <ModelList
                        model={props.model}
                        open={store.open && list()}
                        onSelect={() => {
                          setStore("open", false)
                          props.onClose()
                        }}
                      />
                    </Show>
                  </div>
                </div>
              </div>
            </Popover>
          }
        >
          <ModelSelectorDrawer
            model={props.model}
            trigger={(triggerProps) => (
              <Button
                {...triggerProps}
                variant="ghost-muted"
                size="normal"
                style={{ height: "28px" }}
                class="me-1.5 min-w-0 max-w-[calc(100cqw-140px)] justify-start ![font-weight: 400]"
                classList={{ "animate-in fade-in": shouldAnimate() }}
                data-action="composer-model"
                data-control-type="drawer"
              >
                {content()}
              </Button>
            )}
            onClose={props.onClose}
          />
        </Show>
      </Tooltip>
    </Show>
  )
}
