import { expect, type Locator } from "@playwright/test"
import { story } from "../../stories/playwright/story"

// Which reply counts as the turn's closing one: only it carries copy / fork / model, whether the turn ended on
// a steer, on an idle marker or under the reader's stop.
story("a steer settles only the reply the steered run ends with", async ({ mount }) => {
  const root = await mount("answer-page--steered")

  // The opening prompt and its steer share one turn, and only the closing reply offers copy / fork / model.
  await expect(root.locator('[data-slot="user-message-body"]')).toHaveCount(2)
  await expect(root.locator('[data-slot="answer-reply-footer"]')).toHaveCount(1)
  await expect(root.locator('[data-message-id="msg_steer_answer"] [data-slot="answer-reply-footer"]')).toHaveCount(1)

  // The prompt cuts the process in two, and the work it set off lies in the stretch below the bubble.
  await expect(stretches(root)).resolves.toEqual([["msg_steer_step"], ["msg_steer_answer"]])
})

story("a steered run in progress offers no reply footer at all", async ({ mount }) => {
  const root = await mount("answer-page--steer-running")

  // The step text streamed before the steer is progress, not an answer: nothing has settled to act on.
  await expect(root.locator('[data-slot="user-message-body"]')).toHaveCount(2)
  await expect(root.locator('[data-slot="answer-reply-footer"]')).toHaveCount(0)

  // While the steered run is still working, its newest stretch is the one that reads as live.
  await expect(stretches(root)).resolves.toEqual([["msg_steer_step"], ["msg_steer_answer"]])
})

story("a run stopped inside a tool call names no closing reply", async ({ mount }) => {
  const root = await mount("answer-page--stopped-mid-tool")

  // The stop cut into reading the next screenshot, so the text above it was step commentary: the turn shows
  // what it got out, but offers nothing to copy or fork.
  await expect(root.locator('[data-slot="answer-reply-footer"]')).toHaveCount(0)
})

/** The messages each stretch of the process lays out, in document order. */
function stretches(root: Locator) {
  return root
    .locator('[data-slot="answer-fold"]')
    .evaluateAll((folds) =>
      folds.map((fold) => [
        ...new Set([...fold.querySelectorAll<HTMLElement>("[data-message-id]")].map((row) => row.dataset.messageId)),
      ]),
    )
}
