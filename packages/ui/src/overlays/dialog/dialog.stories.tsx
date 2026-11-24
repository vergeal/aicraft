import { Overlay, Portal, Root, Trigger } from "@kobalte/core/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle, DialogTitleGroup } from "./dialog"
import { ConfirmDialog } from "./confirm-dialog"
import { Button } from "@aicraft/ui/button"
import { useDialog } from "@aicraft/ui/context/dialog"
import { onMount, type JSX } from "solid-js"

const docs = `### Overview
Dialog content wrapper built on Kobalte's dialog primitive with v2 styling.

Compose with \`DialogHeader\`, \`DialogTitle\`, \`DialogTitleGroup\`, \`DialogBody\`, and \`DialogFooter\`.

### API
- \`Dialog\`: \`size\` (normal | large | x-large), \`variant\`, \`fit\`.
- \`DialogHeader\`: row container with optional \`closeLabel\` and \`hideClose\`.
- \`DialogBody\`: body container with the shared 16px inset; pass \`flush\` when the body owns its layout.
- \`DialogTitle\`: accessible single-line header title.
- \`DialogTitleGroup\`: column with \`title\` and required \`description\`.

### Sizes
- \`normal\`: 640px wide, content height capped by the viewport.
- \`large\`: 720px wide, height capped at 560px.
- \`x-large\`: 880px wide, height capped at 600px.

### Confirm
\`ConfirmDialog\` wraps the shared confirm structure: \`title\`, \`description\`, optional \`details\`,
\`confirmLabel\`, \`cancelLabel\`, \`tone\` (\`danger | default\`), \`onConfirm\`, and \`onCancel\`.

### Accessibility
- Focus trapping and aria attributes provided by Kobalte Dialog.

### Theming/tokens
- Uses \`data-component="dialog-v2"\` and slot attributes.
`

export default {
  title: "UI/Dialog",
  id: "ui-dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

function dialogHeader(title: string, description: string) {
  return (
    <DialogHeader>
      <DialogTitleGroup title={title} description={description} />
    </DialogHeader>
  )
}

// Opens through the dialog stack, so a preview that holds its dialogs holds this one too.
function OpenStoryDialog(props: { render: () => JSX.Element }) {
  const dialog = useDialog()

  const open = () => void dialog.show(props.render)

  onMount(open)

  return (
    <Button variant="neutral" onClick={open}>
      Open dialog
    </Button>
  )
}

export const Basic = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <Dialog>
          {dialogHeader("Dialog", "Description")}
          <DialogBody>Dialog body content.</DialogBody>
        </Dialog>
      )}
    />
  ),
}

export const Sizes = {
  render: () => (
    <div style={{ display: "flex", gap: "12px" }}>
      <Root>
        <Trigger as={Button} variant="neutral">
          Normal
        </Trigger>
        <Portal>
          <Overlay />
          <Dialog>
            {dialogHeader("Normal", "Normal size")}
            <DialogBody>Normal dialog content.</DialogBody>
          </Dialog>
        </Portal>
      </Root>

      <Root>
        <Trigger as={Button} variant="neutral">
          Large
        </Trigger>
        <Portal>
          <Overlay />
          <Dialog size="large">
            {dialogHeader("Large", "Large size")}
            <DialogBody>Large dialog content.</DialogBody>
          </Dialog>
        </Portal>
      </Root>

      <Root>
        <Trigger as={Button} variant="neutral">
          X-Large
        </Trigger>
        <Portal>
          <Overlay />
          <Dialog size="x-large">
            {dialogHeader("Extra large", "X-large size")}
            <DialogBody>X-large dialog content.</DialogBody>
          </Dialog>
        </Portal>
      </Root>
    </div>
  ),
}

export const TitleOnly = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <Dialog>
          <DialogHeader>
            <DialogTitle>Open project</DialogTitle>
          </DialogHeader>
          <DialogBody>Dialog body content.</DialogBody>
        </Dialog>
      )}
    />
  ),
}

export const HeaderControls = {
  render: () => (
    <Root>
      <Trigger as={Button} variant="neutral">
        Open dialog
      </Trigger>
      <Portal>
        <Overlay />
        <Dialog>
          <DialogHeader>
            <DialogTitleGroup title="Custom header" description="Dialog with an extra header control" />
            <Button variant="neutral" size="small">
              Help
            </Button>
          </DialogHeader>
          <DialogBody>Dialog body content.</DialogBody>
        </Dialog>
      </Portal>
    </Root>
  ),
}

export const WithFooter = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <Dialog fit>
          {dialogHeader("Save changes", "Your changes will be lost if you don't save them.")}
          <DialogFooter>
            <Button variant="neutral">Cancel</Button>
            <Button variant="submit">Save</Button>
          </DialogFooter>
        </Dialog>
      )}
    />
  ),
}

export const WithFooterThreeButtons = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <Dialog fit>
          {dialogHeader("Unsaved changes", "You have unsaved changes. What would you like to do?")}
          <DialogFooter>
            <span style={{ "margin-right": "auto" }}>
              <Button variant="neutral">Remind me later</Button>
            </span>
            <Button variant="neutral">Cancel</Button>
            <Button variant="submit">Save</Button>
          </DialogFooter>
        </Dialog>
      )}
    />
  ),
}

export const Fit = {
  render: () => (
    <Root>
      <Trigger as={Button} variant="neutral">
        Open fit dialog
      </Trigger>
      <Portal>
        <Overlay />
        <Dialog fit>
          {dialogHeader("Fit content", "Dialog fits its content.")}
          <DialogBody>Dialog fits its content.</DialogBody>
        </Dialog>
      </Portal>
    </Root>
  ),
}

function OpenFromButton() {
  const dialog = useDialog()

  return (
    <Button
      variant="neutral"
      onClick={() =>
        dialog.show(() => (
          <Dialog>
            {dialogHeader("Choose model", "Pick Alpha or Beta")}
            <DialogBody>Alpha and Beta are available.</DialogBody>
          </Dialog>
        ))
      }
    >
      Choose model
    </Button>
  )
}

export const OpenedFromButton = {
  render: () => <OpenFromButton />,
}

export const Confirm = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <ConfirmDialog
          title="Publish changes"
          description="The draft becomes the published version for everyone."
          confirmLabel="Publish"
          cancelLabel="Cancel"
          onConfirm={() => {}}
        />
      )}
    />
  ),
}

export const ConfirmDanger = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <ConfirmDialog
          title="Delete session"
          description="This session and every message inside it will be removed."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={() => {}}
        />
      )}
    />
  ),
}

export const ConfirmWithDetails = {
  render: () => (
    <OpenStoryDialog
      render={() => (
        <ConfirmDialog
          title="Remove library"
          description="The files stay on disk. Only the library is removed."
          details={[
            "Detaches 42 indexed files",
            "Clears the summaries for this library",
            "Keeps the remembered review decisions",
          ]}
          confirmLabel="Remove"
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={() => {}}
        />
      )}
    />
  ),
}
