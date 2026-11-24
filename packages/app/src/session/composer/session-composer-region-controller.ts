import type { Accessor } from "solid-js"
import type { SessionRequestModel } from "../requests/model"

export function createSessionComposerRegionController(input: {
  state: SessionRequestModel
  child: Accessor<boolean>
  centered: Accessor<boolean>
  onResponseSubmit: () => void
  openParent: () => void
  focusPrompt: () => void
  setPromptRef: (el: HTMLDivElement) => void
  setDockRef: (el: HTMLDivElement) => void
}) {
  return {
    state: input.state,
    centered: input.centered,
    onResponseSubmit: input.onResponseSubmit,
    openParent: input.openParent,
    focusPrompt: input.focusPrompt,
    setPromptRef: input.setPromptRef,
    setDockRef: input.setDockRef,
    child: input.child,
    showComposer: () => !input.state.blocked() || input.child(),
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
