import { For, Show, type JSXElement } from "solid-js"
import { Button } from "../../actions/button/button"
import { useDialog } from "../../context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "./dialog"
import "./confirm-dialog.css"

export interface ConfirmDialogProps {
  title: JSXElement
  description?: JSXElement
  /** What the action affects, one line per item. Omit it for a one-sentence confirmation. */
  details?: string[]
  confirmLabel: string
  cancelLabel: string
  tone?: "danger" | "default"
  onConfirm: () => void
  onCancel?: () => void
}

/**
 * The shared shape for confirming an action. It closes the dialog before running either callback, so a caller can
 * start async work from `onConfirm` without keeping the dialog up.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const dialog = useDialog()

  const cancel = () => {
    dialog.close()
    props.onCancel?.()
  }

  const confirm = () => {
    dialog.close()
    props.onConfirm()
  }

  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup title={props.title} description={props.description} />
      </DialogHeader>
      <Show when={props.details?.length}>
        <DialogBody flush>
          <ul data-component="confirm-dialog-details">
            <For each={props.details}>{(detail) => <li>{detail}</li>}</For>
          </ul>
        </DialogBody>
      </Show>
      <DialogFooter>
        <Button variant="neutral" autofocus onClick={cancel}>
          {props.cancelLabel}
        </Button>
        <Button variant={props.tone === "danger" ? "danger" : "submit"} onClick={confirm}>
          {props.confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
