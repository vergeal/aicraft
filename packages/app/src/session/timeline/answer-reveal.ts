/** Reveal one row inside the answer timeline, expanding whatever hides it first. */

const MAX_DEPTH = 6

/**
 * Expand the turn fold, then the process group, then the row's own disclosure, and scroll the row
 * into view. Search and part reveals both go through here so they share one expansion order.
 * @param root - the timeline viewport
 * @param id - message id used when no part identity matches
 * @param partID - content part identity, preferred because one message can hold several rows
 * @param onSettled - runs after the scroll, so a caller that mounted every row for the reveal can release it
 * @returns whether a row was found
 */
export function revealInTimeline(
  root: HTMLElement,
  id: string,
  partID?: string,
  onSettled?: () => void,
) {
  const element =
    (partID ? root.querySelector(`[data-timeline-part-id="${CSS.escape(partID)}"]`) : null) ??
    root.querySelector(`[data-message-id="${CSS.escape(id)}"]`)

  if (!(element instanceof HTMLElement)) return false
  expandAncestors(element)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      element.scrollIntoView?.({ block: "center", behavior: "auto" })
      onSettled?.()
    }),
  )

  return true
}

function expandAncestors(element: Element) {
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const foldButton = element
      .closest('[data-slot="answer-fold"]')
      ?.querySelector<HTMLButtonElement>('[data-slot="answer-run-header"] button')

    if (foldButton && !foldButton.disabled && foldButton.getAttribute("aria-expanded") === "false") {
      foldButton.click()

      continue
    }

    const groupButton = element.closest('[data-slot="answer-group"]')?.querySelector<HTMLElement>(":scope > button")

    if (groupButton && groupButton.getAttribute("aria-expanded") === "false") {
      groupButton.click()

      continue
    }

    const row = element.closest('[data-slot="answer-disclosure"]')?.querySelector<HTMLElement>("[data-disclosure-row]")

    if (row && row.getAttribute("aria-expanded") === "false") {
      row.click()

      continue
    }

    break
  }
}
