import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AnalysisSink } from "../src/ai/loop.js"
import { analyzeOnce, capabilityList, latestBatch, loadCursor, loadBatch } from "../src/ai/loop.js"
import { defaultProfile } from "../src/profile/schema.js"
import type { HytProfile } from "../src/profile/schema.js"

const SELF = "csT1002173"
const ACCOUNT_SESSION = "cs20254801"
const GROUP = "g80001419326603732"

function database() {
  const db = new Database(":memory:")
  db.exec(`
    create table chatmsg (
      Id integer primary key autoincrement, MsgType integer, MsgId text, Msg text, Sender text, SenderNick text,
      Receiver text, CreatedTime text, LocalTime text, SessionId text, SessionType integer, UserData text,
      FileName text, FileUrl text, FileFullPath text, FileSize text, GroupId text, isAt integer, ReadStatus integer
    );
    create table keepgroup (GroupId text, GroupName text);
  `)
  db.exec(`insert into keepgroup (GroupId, GroupName) values ('${GROUP}', '运维值班群')`)
  return db
}

function insert(
  db: Database,
  input: { sender: string; text: string; sessionId: string; isAt?: number; msgType?: number },
) {
  db.query(
    `insert into chatmsg (MsgType, MsgId, Msg, Sender, SenderNick, Receiver, CreatedTime, LocalTime, SessionId, SessionType, UserData, ReadStatus, isAt)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9, '', 1, ?10)`,
  ).run(
    input.msgType ?? 1,
    `msg-${crypto.randomUUID()}`,
    input.text,
    input.sender,
    input.sender,
    SELF,
    String(Date.now()),
    input.sessionId,
    input.sessionId.startsWith("g") ? 1 : 0,
    input.isAt ?? 0,
  )
}

function draftsEnabled(): HytProfile {
  const base = defaultProfile(SELF)
  return { ...base, capabilities: { ...base.capabilities, drafts: { enabled: true } } }
}

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "hyt-loop-"))
  return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) }
}

describe("capabilityList", () => {
  test("默认档案没有任何能力", () => {
    expect(capabilityList(defaultProfile(SELF))).toEqual([])
  })

  test("开启后按固定顺序列出", () => {
    const base = defaultProfile(SELF)
    const profile: HytProfile = {
      ...base,
      capabilities: {
        ...base.capabilities,
        style: { enabled: true },
        tasks: { enabled: true },
        drafts: { enabled: true },
      },
    }
    expect(capabilityList(profile)).toEqual(["drafts", "tasks", "style"])
  })
})

describe("analyzeOnce", () => {
  test("能力全关时不读库、不落批次", async () => {
    const { directory, cleanup } = await workspace()
    const db = database()
    try {
      insert(db, { sender: ACCOUNT_SESSION, text: "这个报错怎么排查", sessionId: ACCOUNT_SESSION })
      const result = await analyzeOnce({ dataDir: directory, profile: defaultProfile(SELF), db, selfAccount: SELF })
      expect(result.status).toBe("off")
      expect(await latestBatch(directory)).toBeUndefined()
    } finally {
      db.close()
      await cleanup()
    }
  })

  test("预过滤后生成批次并投递，重复调用不会重复处理", async () => {
    const { directory, cleanup } = await workspace()
    const db = database()
    const delivered: { batchId: string; text: string }[] = []
    const sink: AnalysisSink = {
      async deliver(input) {
        delivered.push(input)
        return { sessionId: "ses_test", delivered: true }
      },
    }
    try {
      insert(db, { sender: SELF, text: "我看下", sessionId: ACCOUNT_SESSION })
      insert(db, { sender: ACCOUNT_SESSION, text: "这个报错怎么排查", sessionId: ACCOUNT_SESSION })
      insert(db, { sender: "cs99999999", text: "我去吃饭了", sessionId: GROUP })

      const first = await analyzeOnce({ dataDir: directory, profile: draftsEnabled(), db, selfAccount: SELF, sink })
      expect(first.status).toBe("delivered")
      expect(first.candidates).toBe(1)
      expect(delivered).toHaveLength(1)
      expect(delivered[0]!.text).toContain("hyt.draft.generate")

      const batch = await loadBatch(directory, first.batchId!)
      expect(batch?.messages).toHaveLength(1)
      expect(batch?.messages[0]!.text).toBe("这个报错怎么排查")
      expect(batch?.messages[0]!.direct).toBe(true)
      expect(batch?.delivered).toBe(true)

      const second = await analyzeOnce({ dataDir: directory, profile: draftsEnabled(), db, selfAccount: SELF, sink })
      expect(second.status).toBe("empty")
      expect(delivered).toHaveLength(1)

      insert(db, { sender: ACCOUNT_SESSION, text: "好了，麻烦确认下", sessionId: ACCOUNT_SESSION })
      const third = await analyzeOnce({ dataDir: directory, profile: draftsEnabled(), db, selfAccount: SELF, sink })
      expect(third.status).toBe("delivered")
      expect(third.candidates).toBe(1)
      const latest = await loadBatch(directory, third.batchId!)
      expect(latest?.messages[0]!.text).toBe("好了，麻烦确认下")
    } finally {
      db.close()
      await cleanup()
    }
  })

  test("没有会话能力时批次仍然落盘，可用最新批次手动处理", async () => {
    const { directory, cleanup } = await workspace()
    const db = database()
    try {
      insert(db, { sender: ACCOUNT_SESSION, text: "这个报错怎么排查", sessionId: ACCOUNT_SESSION })
      const result = await analyzeOnce({ dataDir: directory, profile: draftsEnabled(), db, selfAccount: SELF })
      expect(result.status).toBe("queued")
      const batch = await latestBatch(directory)
      expect(batch?.id).toBe(result.batchId)
      expect(batch?.capabilities).toEqual(["drafts"])
    } finally {
      db.close()
      await cleanup()
    }
  })

  test("投递失败时批次保留，游标前进", async () => {
    const { directory, cleanup } = await workspace()
    const db = database()
    const sink: AnalysisSink = {
      async deliver() {
        return { sessionId: "", delivered: false, error: "会话不可用" }
      },
    }
    try {
      insert(db, { sender: ACCOUNT_SESSION, text: "这个报错怎么排查", sessionId: ACCOUNT_SESSION })
      const result = await analyzeOnce({ dataDir: directory, profile: draftsEnabled(), db, selfAccount: SELF, sink })
      expect(result.status).toBe("stored")
      expect(result.error).toBe("会话不可用")
      const cursor = await loadCursor(directory)
      expect(cursor.lastId).toBeGreaterThan(0)
    } finally {
      db.close()
      await cleanup()
    }
  })
})
