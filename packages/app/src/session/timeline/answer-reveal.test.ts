import { describe, expect, test } from "bun:test"
import { revealInTimeline } from "./answer-reveal"

/** Build the answer timeline's disclosure tree the way the components render it. */
function timeline(partID: string | undefined, state = { fold: false, group: false, row: false }) {
  document.body.innerHTML = `
    <div data-slot="session-timeline-scroll">
      <section data-slot="answer-fold">
        <div data-slot="answer-run-header" role="status">
          <button aria-expanded="${state.fold}"></button>
        </div>
        <section data-slot="answer-group">
          <button aria-expanded="${state.group}"></button>
          <div data-slot="answer-disclosure">
            <div data-disclosure-row role="button" aria-expanded="${state.row}"></div>
            <div data-timeline-part-id="${partID ?? ""}" data-message-id="msg_1">row</div>
          </div>
        </section>
      </section>
    </div>
  `

  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button, [data-disclosure-row]")]

  for (const button of buttons) {
    button.addEventListener("click", () => {
      button.setAttribute("aria-expanded", button.getAttribute("aria-expanded") === "true" ? "false" : "true")
    })
  }

  return { root: document.querySelector<HTMLElement>('[data-slot="session-timeline-scroll"]')! }
}

const expanded = (selector: string) => document.querySelector(selector)?.getAttribute("aria-expanded")

describe("answer reveal", () => {
  test("expands the fold, group, and row around a part and reports the hit", () => {
    const { root } = timeline("msg_2:text:0")

    expect(revealInTimeline(root, "msg_1", "msg_2:text:0")).toBe(true)
    expect(expanded('[data-slot="answer-run-header"] button')).toBe("true")
    expect(expanded('[data-slot="answer-group"] > button')).toBe("true")
    expect(expanded("[data-disclosure-row]")).toBe("true")
  })

  test("expands a collapsed turn and group when a part is revealed", () => {
    const { root } = timeline("msg_2:text:0", { fold: false, group: false, row: false })

    expect(revealInTimeline(root, "msg_1", "msg_2:text:0")).toBe(true)
    expect(expanded('[data-slot="answer-run-header"] button')).toBe("true")
    expect(expanded('[data-slot="answer-group"] > button')).toBe("true")
    expect(expanded("[data-disclosure-row]")).toBe("true")
  })

  test("falls back to the message id and reports a miss", () => {
    const { root } = timeline("msg_2:text:0")

    expect(revealInTimeline(root, "msg_1")).toBe(true)
    expect(revealInTimeline(root, "msg_missing")).toBe(false)
  })

  test("leaves an already open tree alone", () => {
    const { root } = timeline("msg_2:text:0", { fold: true, group: true, row: true })

    expect(revealInTimeline(root, "msg_1", "msg_2:text:0")).toBe(true)
    expect(expanded('[data-slot="answer-run-header"] button')).toBe("true")
  })
})
