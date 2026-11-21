import { Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { Button } from "@opencode/ui/button"
import { Popover } from "@opencode/ui/popover"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Keybind } from "@opencode/ui/keybind"
import { Tooltip } from "@opencode/ui/tooltip"
import { ComposerEditor, composerOverlayGutter } from "./editor/editor"
import "./overlay.css"
import type { ComposerSelectControl } from "./editor/interaction"
import { ComposerVariantSlider } from "./editor/variant-slider"
import { DialogSelectModel, ModelSelectorDrawer } from "@/providers/models/select-dialog"
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
  const dialog = useDialog()

  const open = (detail: number) => {
    if (!props.paid) return props.onUnpaidClick()
    // A pointer open keeps focus in the composer, so the dialog returns it to the caret. A keyboard open
    // (a click with no pointer presses) returns focus to this trigger instead of moving it to the editor.
    void dialog.show(() => <DialogSelectModel model={props.model} />, detail === 0 ? undefined : props.onClose)
  }

  // A previewed chip is visible before the catalog loads, so a click on it opens the dialog once loading finishes.
  const [deferred, setDeferred] = createSignal<number>()
  const [store, setStore] = createStore({ open: false })
  const [gutter, setGutter] = createSignal(8)
  const hasVariant = () => !!props.variant && props.variant.options().length > 1

  createEffect(() => {
    const detail = deferred()

    if (props.loading || detail === undefined) return
    setDeferred(undefined)
    open(detail)
  })

  const content = () => <bdi class="flex min-w-0 whitespace-nowrap leading-[22px]">{props.label.model}</bdi>

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
              class="composer-overlay-surface"
              onOpenChange={(next) => {
                // A preview opens the dialog once the catalog loads, and a model without effort
                // options keeps the old one-click dialog instead of a card with a single row.
                if (next && (props.loading || !hasVariant())) return setDeferred(1)
                setStore("open", next)
              }}
              placement="top-end"
              gutter={gutter()}
              triggerAs={Button}
              trigger={content()}
              triggerProps={{
                class: `me-1.5 min-w-0 max-w-[calc(100cqw-140px)] justify-start ![font-weight: 400] ${
                  shouldAnimate() ? "animate-in fade-in" : ""
                }`,
                style: { height: "32px" },
                variant: "ghost-muted",
                size: "normal",
                "data-action": "composer-model",
                "data-control-type": "popover",
                "aria-label": props.title,
                // The popover reads its gutter when it opens, and the pointer trigger opens on pointerdown, so the
                // distance is measured there rather than on the later mousedown.
                onPointerDown: (event: PointerEvent) =>
                  setGutter(composerOverlayGutter(event.currentTarget as HTMLElement)),
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ")
                    setGutter(composerOverlayGutter(event.currentTarget as HTMLElement))
                },
                onMouseDown: (event: MouseEvent) => event.preventDefault(),
              }}
            >
              <div data-slot="composer-model-popover" class="flex w-[240px] flex-col p-2">
                <Show when={hasVariant()}>
                  <div class="flex h-7 items-center px-1">
                    <span class="min-w-0 truncate text-[12px] leading-4 text-v2-text-text-faint">
                      {props.variantTitle}
                    </span>
                  </div>
                  <Show when={props.variant}>
                    {(control) => <ComposerVariantSlider control={control()} label={props.variantTitle} />}
                  </Show>
                  <div class="my-1 h-px shrink-0 bg-v2-border-border-muted" />
                </Show>
                <button
                  type="button"
                  data-slot="composer-model-row"
                  class="flex h-[30px] w-full items-center gap-2 rounded-lg px-1 text-start text-[13px] leading-5 text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                  onClick={() => {
                    setStore("open", false)
                    open(1)
                  }}
                >
                  <span class="min-w-0 flex-1 truncate">{props.title}</span>
                  <Icon name="chevron-right" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                </button>
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
                style={{ height: "32px" }}
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
