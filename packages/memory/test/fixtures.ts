import { MemoryReference, MemorySubsystem } from "../src/index.js"
import type { MemoryRecord, MemoryType, Settings, Store } from "../src/index.js"

export const PROJECT = "proj_alpha"
export const SCOPES = ["global", `project:${PROJECT}`]

export interface SeedInput {
  readonly id: string
  readonly scope: "global" | "project"
  readonly type: MemoryType
  readonly text: string
  readonly tags: readonly string[]
  readonly trigger?: string
}

/** Seeded from this project's real saved memories and rules, CJK-dominant — the shape the
 *  retrieval layer must serve at scale. Ids are explicit so assertions name the entry. */
export const SEED: readonly SeedInput[] = [
  { id: "mem_pp", scope: "global", type: "preference", trigger: "pp", text: "pp = push code，把当前任务的改动 commit 并 push 到远端；默认只提交相关文件，不牵连其他 WIP", tags: ["git", "workflow"] },
  { id: "mem_reply", scope: "global", type: "preference", text: "回复风格：结论先行，能用表格就不写长段落，保留代码与命令原文", tags: ["communication"] },
  { id: "mem_plastic", scope: "global", type: "project_knowledge", text: "液态玻璃观感在 Windows 上读不出来：桌面 win32 分支有意保持窗口不透明，只有 darwin 用 vibrancy，这不是漏写样式", tags: ["ui", "windows"] },
  { id: "mem_commit", scope: "project", type: "convention", text: "commit message 采用 conventional 格式 type(scope): summary，类型限 feat fix docs chore refactor test", tags: ["git"] },
  { id: "mem_branch", scope: "project", type: "convention", text: "分支名用短横线分隔的至多三词命名，禁止斜杠和 feat/ fix/ 这类类型前缀", tags: ["git"] },
  { id: "mem_font", scope: "project", type: "project_knowledge", text: "客户端默认字体栈采用 deepseek-harness 这套，代码字体后面追加 PingFang SC 与 Microsoft YaHei 来保证中文回退", tags: ["font", "ui"] },
  { id: "mem_cssvars", scope: "project", type: "convention", text: "组件里禁止硬编码颜色、字号、间距和魔法圆角，一律使用 --v2-* 语义变量和 color-mix()", tags: ["design", "css"] },
  { id: "mem_i18n", scope: "project", type: "convention", text: "用户可见文案全部走 i18n，新增 key 必须同时在 zh.ts 写简体中文值，禁止界面硬编码英文", tags: ["i18n"] },
  { id: "mem_scroll", scope: "project", type: "project_knowledge", text: "页面滚动用原生 overflow-y-auto 并标记 data-scrollable，菜单弹层用 MenuScroll；禁止设置 scrollbar-width thin", tags: ["scroll", "ui"] },
  { id: "mem_landing", scope: "project", type: "historical", text: "会话页面自动跳转已用 CDP 实测定位：触发条件是 localStorage 存在 timeline position 且 bottom false，路径走 restoreMissed 后 stickToEnd", tags: ["bug", "timeline"] },
  { id: "mem_solid", scope: "project", type: "convention", text: "SolidJS 优先 createStore 而不是多个 createSignal；生命周期必须建显式状态机，不许用布尔标志位堆", tags: ["solid", "architecture"] },
  { id: "mem_testrule", scope: "project", type: "convention", text: "测试禁止从仓库根目录跑，必须进包目录跑单文件；单条命令 timeout 不超过三十秒", tags: ["test"] },
  { id: "mem_restart", scope: "project", type: "convention", text: "调试时禁止重启用户正在运行的应用或 server 进程，这永远是红线", tags: ["debug"] },
  { id: "mem_cdp", scope: "project", type: "project_knowledge", text: "Playwright 附着运行中的桌面应用要用 connectOverCDP 加 noDefaults，否则默认媒体仿真会让画面闪成浅色", tags: ["playwright", "desktop"] },
  { id: "mem_toolcost", scope: "project", type: "convention", text: "工具调用经济学：独立调用在同一步并发发出，无关探测合进一条 shell，别为一次读取付整份上下文重发的钱", tags: ["workflow"] },
  { id: "mem_type5", scope: "project", type: "decision", text: "记忆 type 枚举定稿五类：convention 与 preference 进注入窗口，decision project_knowledge historical 只走检索", tags: ["memory-system"] },
  { id: "mem_vector", scope: "project", type: "decision", text: "向量通道选型：bge-small-zh GGUF 加 llama-embedding 独立二进制子进程，预算二百兆内，Qwen3-0.6B 只当天花板参照", tags: ["memory-system", "embedding"] },
  { id: "mem_owner", scope: "project", type: "decision", text: "记忆归属决定：第一阶段不加 owner 列，channel 保持分库隔离，global 记忆靠导出导入兜底", tags: ["memory-system"] },
  { id: "mem_settings", scope: "project", type: "project_knowledge", text: "设置页标题条和页面背景必须共用 --settings-canvas 渐变 token 并加 background-attachment fixed，暗色覆盖 token 不覆盖 background", tags: ["settings", "css"] },
  { id: "mem_sdkgen", scope: "project", type: "historical", text: "httpapi-codegen 曾把客户端命名空间硬编码成含空格的非法标识符导致 generate 整体写坏，已改为 Aicraft", tags: ["sdk", "codegen"] },
  { id: "mem_check", scope: "project", type: "convention", text: "改动期间只验证改过的包：包目录内 typecheck 加 lint changed；全量 check 留给提交前跑一次", tags: ["workflow", "check"] },
]

/** Queries that should surface the given entry in the per-turn injection (convention/preference
 *  only — the type partition is part of what each case asserts). */
export const TURN_GOLD: ReadonlyArray<{ query: string; expect: string; via: "trigger" | "lexical" }> = [
  { query: "pp", expect: "mem_pp", via: "trigger" },
  { query: "帮我 pp 一下", expect: "mem_pp", via: "trigger" },
  { query: "commit message 格式类型", expect: "mem_commit", via: "lexical" },
  { query: "分支命名规范", expect: "mem_branch", via: "lexical" },
  { query: "颜色硬编码", expect: "mem_cssvars", via: "lexical" },
  { query: "界面文案 zh.ts", expect: "mem_i18n", via: "lexical" },
  { query: "重启应用", expect: "mem_restart", via: "lexical" },
  { query: "工具调用合并", expect: "mem_toolcost", via: "lexical" },
  { query: "状态机生命周期规则", expect: "mem_solid", via: "lexical" },
]

/** Queries whose entries must come back from search but must NOT auto-inject by type. */
export const SEARCH_GOLD: ReadonlyArray<{ query: string; expect: string; autoInjectForbidden: true }> = [
  { query: "字体", expect: "mem_font", autoInjectForbidden: true },
  { query: "向量选型", expect: "mem_vector", autoInjectForbidden: true },
  { query: "playwright 怎么附着", expect: "mem_cdp", autoInjectForbidden: true },
  { query: "液态玻璃怎么回事", expect: "mem_plastic", autoInjectForbidden: true },
  { query: "设置页渐变怎么拼", expect: "mem_settings", autoInjectForbidden: true },
  { query: "记忆类型枚举定稿", expect: "mem_type5", autoInjectForbidden: true },
  { query: "codegen 命名空间写坏那次", expect: "mem_sdkgen", autoInjectForbidden: true },
  { query: "owner 归属怎么决定", expect: "mem_owner", autoInjectForbidden: true },
]

export const NO_MATCH_QUERIES = ["今天天气怎么样", "帮我写一首诗", "推荐一家餐厅"]

/** Three 20-phrase pools with offset strides. Phrases are 5-7 characters so a repeated
 *  segment is a minority of the token bag: the worst pair (two segments equal) lands near
 *  0.6 containment, clear of the 0.85 near-duplicate gate. The earlier designs collapsed
 *  400 → 153 and → 246 in dedup: long repeated topic sentences dominate a bag, which
 *  silently destroys the corpus scale the metrics depend on. Phrases avoid every gold query
 *  token (字体/颜色/分支/命名/状态/工具/调用/重启/应用/记忆/向量/玻璃/渐变/设置/枚举/类型/
 *  格式/归属/索引/天气/提交/评审/文案/硬编码/索引/缩写…) so a filler stealing a slot is a
 *  real precision failure, and the NO_MATCH queries (天气/诗/餐厅) share nothing here. */
const FILLER_A = [
  "周末骑行环路", "手冲耶加雪菲", "堆肥桶翻堆", "黑胶唱机保养", "葡萄架搭修剪",
  "潜水气瓶检测", "底片扫描仪校准", "路亚饵配重", "滴灌定时器编程", "露营炉具深度清洁",
  "观鸟长焦参数", "鲁邦种喂养记录", "海钓潮汐记录", "攀岩绳结年检", "微缩模型分色",
  "果蔬酵素排气", "温泉泳镜除雾", "皮筏漏气修补", "望远镜极轴对准", "木工榫卯试作",
]
const FILLER_B = [
  "平均心率区间", "粉水比例微调", "碳氮比估算", "针压克数记录", "支架间距测量",
  "气瓶余压读数", "扫描色彩配置", "饵重与水深", "单点出水量", "喷嘴堵塞排查",
  "焦距与快门", "喂养间隔时间", "满潮高潮时刻", "绳结承重余量", "底漆分色边界",
  "发酵天数温度", "视野清晰度", "粘合固化时长", "赤纬偏差修正", "缝隙公差控制",
]
const FILLER_C = [
  "两周后复盘", "雨天顺延暂停", "低温环境加速", "分三批进行", "先拿小样试验",
  "全程戴手套", "避光直立存放", "固定在晨间做", "每月校验一次", "先测数据再调",
  "结果记入表格", "每个节点拍照", "对照组同步做", "剂量先减半", "分上午下午两段",
  "密封静置一夜", "左右交替轮换", "需提前预约", "双人独立复核", "留一份样待查",
]

const FILLER_TYPE: readonly MemoryType[] = [
  "convention",
  "project_knowledge",
  "decision",
  "historical",
  "convention",
  "project_knowledge",
  "preference",
  "decision",
  "project_knowledge",
  "historical",
]

/**
 * A deterministic bulk corpus: the design input is ten-thousand-entry long-term use, not a
 * fresh install, so metrics that only hold at 21 entries would be worthless.
 */
export function bulkFiller(count = 400): SeedInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `mem_f_${index}`,
    scope: index % 5 === 0 ? "global" : "project",
    type: FILLER_TYPE[index % FILLER_TYPE.length],
    text: `${FILLER_A[index % 20]}，${FILLER_B[Math.floor(index / 20) % 20]}，${FILLER_C[Math.floor(index / 13) % 20]}，流水 ${index + 1} 核对 ${index + 4001}`,
    tags: ["filler"],
  }))
}

export const CORPUS: readonly SeedInput[] = [...SEED, ...bulkFiller()]

/** The old kernel's read path, kept as a measurement baseline: kv.ts ordered by key over
 *  `memory/<scope>/<uuid>` suffixes, which is random order, and the window took the first
 *  entries until the 4000-character budget was full; search was naive substring matching.
 *  Not a reimplementation of policy — only of the ordering and matching the old code had. */
export function legacyInject(records: readonly MemoryRecord[], budget = 4000): string[] {
  const ordered = [...records].sort((a, b) => legacyKey(a).localeCompare(legacyKey(b)))
  const taken: string[] = []
  let used = 0
  for (const record of ordered) {
    if (used + record.text.length > budget) continue
    used += record.text.length
    taken.push(record.id)
  }
  return taken
}

export function legacySearch(records: readonly MemoryRecord[], query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase()
  return records.filter((record) => record.text.toLowerCase().includes(needle)).slice(0, limit).map((record) => record.id)
}

function legacyKey(record: MemoryRecord): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < record.id.length; i++) {
    hash ^= record.id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `memory/${record.scope}/${hash.toString(16).padStart(8, "0")}`
}

export function fixedClock(start = Date.UTC(2026, 10, 25, 0, 0, 0)): () => string {
  let step = 0
  return () => new Date(start + step++ * 60_000).toISOString()
}

/** The harness every test uses: input → subsystem → output, no server, no database, no model.
 *  Default is the no-embedder configuration so the golden set asserts the lexical fallback —
 *  the fake embedder is a mechanics stand-in, never a semantic proxy (see AGENTS.md). */
export interface Harness {
  readonly memory: ReturnType<typeof MemorySubsystem.createSubsystem>
  readonly store: Store
  readonly records: readonly MemoryRecord[]
}

export async function corpus(options?: {
  settings?: Settings
  embedder?: boolean
  seed?: readonly SeedInput[]
  store?: Store
}): Promise<Harness> {
  const store = options?.store ?? MemoryReference.createStore()
  const memory = MemorySubsystem.createSubsystem({
    store,
    embedder: options?.embedder === true ? MemoryReference.createFakeEmbedder() : undefined,
    settings: options?.settings,
    clock: fixedClock(),
  })
  for (const entry of options?.seed ?? SEED) {
    await memory.save({
      scope: entry.scope,
      projectID: entry.scope === "project" ? PROJECT : undefined,
      type: entry.type,
      text: entry.text,
      tags: entry.tags,
      trigger: entry.trigger,
      id: entry.id,
    })
  }
  const pages = await Promise.all(SCOPES.map((scope) => memory.list(scope, 10_000)))
  return { memory, store, records: pages.flatMap((page) => page.records) }
}

export async function seeded(options?: {
  settings?: Settings
  embedder?: boolean
  seed?: readonly SeedInput[]
  store?: Store
}): Promise<Harness["memory"]> {
  return (await corpus(options)).memory
}
