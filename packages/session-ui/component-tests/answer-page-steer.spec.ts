import { expect } from "@playwright/test"
import { story } from "../../stories/playwright/story"

story("a steer settles only the reply the steered run ends with", async ({ mount }) => {
  const root = await mount("answer-page--steered")

  // The opening prompt and its steer share one turn, and only the closing reply offers copy / fork / model.
  await expect(root.locator('[data-slot="user-message-body"]')).toHaveCount(2)
  await expect(root.locator('[data-slot="answer-reply-footer"]')).toHaveCount(1)
  await expect(root.locator('[data-message-id="msg_steer_answer"] [data-slot="answer-reply-footer"]')).toHaveCount(1)
})

story("a steered run in progress offers no reply footer at all", async ({ mount }) => {
  const root = await mount("answer-page--steer-running")

  // The step text streamed before the steer is progress, not an answer: nothing has settled to act on.
  await expect(root.locator('[data-slot="user-message-body"]')).toHaveCount(2)
  await expect(root.locator('[data-slot="answer-reply-footer"]')).toHaveCount(0)
})
