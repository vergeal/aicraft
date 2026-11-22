import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadDrafts, markDraft, pendingDrafts, putDraft, saveDrafts } from "../src/ai/drafts.js"

const NOW = "2026-11-22T08:00:00.000Z"

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "hyt-drafts-"))
  return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) }
}

describe("草稿箱", () => {
  test("写入后能读回，同会话同消息的 pending 草稿被替换", async () => {
    const { directory, cleanup } = await workspace()
    try {
      const first = await putDraft(directory, { sessionId: "cs1", messageIds: [1, 2], replies: ["第一版"] }, NOW)
      const second = await putDraft(directory, { sessionId: "cs1", messageIds: [1, 2], replies: ["第二版"] }, NOW)
      expect(second.draft.id).toBe(first.draft.id)
      const drafts = await loadDrafts(directory)
      expect(drafts).toHaveLength(1)
      expect(drafts[0]!.replies).toEqual(["第二版"])
    } finally {
      await cleanup()
    }
  })

  test("不同消息或不同会话各自一条", async () => {
    const { directory, cleanup } = await workspace()
    try {
      await putDraft(directory, { sessionId: "cs1", messageIds: [1], replies: ["一"] }, NOW)
      await putDraft(directory, { sessionId: "cs1", messageIds: [2], replies: ["二"] }, NOW)
      await putDraft(directory, { sessionId: "cs2", messageIds: [1], replies: ["三"] }, NOW)
      expect(await loadDrafts(directory)).toHaveLength(3)
    } finally {
      await cleanup()
    }
  })

  test("标记已发送后不再出现在待处理列表里，发送记录累加", async () => {
    const { directory, cleanup } = await workspace()
    try {
      const { draft } = await putDraft(directory, { sessionId: "cs1", replies: ["好的"] }, NOW)
      const updated = await markDraft(directory, draft.id, "sent", NOW, {
        text: "好的",
        msgId: "m1",
        at: NOW,
        recorded: true,
      })
      expect(updated?.status).toBe("sent")
      expect(updated?.sends).toHaveLength(1)
      expect(await pendingDrafts(directory)).toEqual([])
    } finally {
      await cleanup()
    }
  })

  test("空正文拒绝写入；文件损坏时读成空列表", async () => {
    const { directory, cleanup } = await workspace()
    try {
      await expect(putDraft(directory, { sessionId: "cs1", replies: ["   "] }, NOW)).rejects.toThrow()
      await Bun.write(join(directory, "hyt", "drafts.json"), "{不是 json")
      expect(await loadDrafts(directory)).toEqual([])
    } finally {
      await cleanup()
    }
  })

  test("超过 200 条时保留最近的历史与全部待处理", async () => {
    const { directory, cleanup } = await workspace()
    try {
      const drafts = Array.from({ length: 205 }, (_, index) => ({
        id: `d${index}`,
        sessionId: "cs1",
        sessionName: "",
        messageIds: [index],
        replies: ["内容"],
        reason: "",
        knowledgeIds: [],
        status: (index === 0 ? "pending" : "sent") as "pending" | "sent",
        createdAt: `2026-11-22T08:00:${String(index).padStart(2, "0")}.000Z`,
        sends: [],
      }))
      await saveDrafts(directory, drafts, NOW)
      await putDraft(directory, { sessionId: "cs9", replies: ["触发一次裁剪"] }, NOW)
      const loaded = await loadDrafts(directory)
      expect(loaded.length).toBeLessThanOrEqual(201)
      expect(loaded.some((draft) => draft.id === "d0")).toBe(true)
    } finally {
      await cleanup()
    }
  })
})
