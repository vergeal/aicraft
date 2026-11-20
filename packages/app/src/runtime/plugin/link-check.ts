import { createComputed, untrack, type Accessor } from "solid-js"

/**
 * Asks whether a link's file exists only while its timeline is selected. Plugins check links for the selected
 * session alone, so a hidden timeline's answer would be a false negative: a check asked while hidden, or one that
 * comes back negative after the timeline was hidden, even briefly, waits and asks again once it is selected.
 */
export function createLinkCheck(active: Accessor<boolean>, check: (href: string) => boolean | Promise<boolean>) {
  let waiting: (() => void)[] = []
  let hidden = 0

  createComputed(() => {
    if (!active()) {
      hidden++

      return
    }

    const ready = waiting
    waiting = []
    ready.forEach((resolve) => resolve())
  })

  // Markdown asks again for the same path on every streamed delta. A confirmed path stays confirmed, and a check
  // already in flight answers everyone who asks while it runs. A miss is asked again, since the file may appear.
  const confirmed = new Set<string>()
  const inflight = new Map<string, Promise<boolean>>()

  const exists = (href: string): boolean | Promise<boolean> => {
    if (!untrack(active)) return new Promise<void>((resolve) => waiting.push(resolve)).then(() => exists(href))
    if (confirmed.has(href)) return true
    const running = inflight.get(href)
    if (running) return running
    const started = hidden
    const result = untrack(() => check(href))

    if (result === true || result === false) {
      if (result) confirmed.add(href)

      return result
    }

    const pending = result.then(
      (found) => {
        inflight.delete(href)

        if (found) {
          confirmed.add(href)

          return found
        }

        return untrack(active) && hidden === started ? found : exists(href)
      },
      (error) => {
        inflight.delete(href)

        throw error
      },
    )
    inflight.set(href, pending)

    return pending
  }

  return exists
}
