import { MemoryReference, MemorySubsystem } from "../src/index.js"
import type { MemoryRecord, MemoryType, Settings } from "../src/index.js"

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

/** Filler topics deliberately avoid every token the gold queries use (no 字体/颜色/分支/命名/
 *  状态/工具/调用/重启/应用/记忆/向量/玻璃/渐变/设置/枚举/类型/格式/知识库/天气/归属/索引…) so
 *  that a filler entry stealing a slot is a real precision failure, not fixture noise. */
const FILLER = [
  "炖牛腩先焯水去沫，小火两小时后收汁，最后放土豆块和胡萝卜",
  "线上集群扩容先加节点再调副本数，滚动重启期间把 PDB 放宽到二",
  "慢查询先看执行计划，联合索引把高选择性字段放在最左边",
  "手冲咖啡粉水比一点十五，水温八十八度，闷蒸三十秒再分三段注水",
  "半马赛前一周只跑轻松配速，赛前三天完全不练，碳水加载两天",
  "胶片冲洗用两显影液二十度，摇摆前三十秒后每分钟两次，停显两分钟",
  "海水缸换水每周百分之十，盐度先调到千分之三十再缓慢下放生物",
  "桌游聚会八人以上选可八人的策略向，一局不超过九十分钟",
  "普洱熟茶洗茶两遍，第一泡十秒出汤，壶温高一点香气才开",
  "吉他换弦一次只换一根，调音到标准音高后再拉申防止跑音",
  "露营营地选背风处，地钉四十五度打入，天幕一侧留排水沟",
  "猫咪软便先换单一蛋白粮观察两周，益生菌空腹喂",
  "跑步膝痛先停坡道训练，做臀中肌强化每周三次，六周后再加量",
  "烤箱预热到实际温度需要十五分钟，空烤放一块石板蓄热",
  "家庭网络组网用有线回程，Mesh 节点放走廊中央而不是墙后",
  "拍星轨用三十秒长曝光连拍两百张，堆栈时把噪点帧剔除",
  "腌酸白菜要压重物隔绝空气，二十天后亚硝酸盐峰值才降下来",
  "保险选医疗优先于意外，等待期内不做检查项目",
  "房贷提前还款选缩短年限，等额本息比等额本金省的利息更多",
  "阳台种番茄用二十加仑盆，开花期改高磷水溶肥一周一次",
  "机械键盘润轴用二百二十克润滑脂，撤下弹簧逐条涂",
  "长途自驾每两小时休息二十分钟，胎压按满载值打",
  "鱼缸蛋白撇除油膜时要停喂一天，滤材分批清洗不要全换",
  "滑雪换刃先练后刃推坡，重心压在前脚掌，缓坡滑到自如再上中坡",
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
 * fresh install, so metrics that only hold at 21 entries would be worthless. Filler entries
 * carry numeric suffixes (never colliding with gold tokens) and cycle through types so about
 * a fifth of them are auto-injectable and can genuinely steal a slot.
 */
export function bulkFiller(count = 400): SeedInput[] {
  return Array.from({ length: count }, (_, index) => {
    const type = FILLER_TYPE[index % FILLER_TYPE.length]
    return {
      id: `mem_f_${index}`,
      scope: index % 5 === 0 ? "global" : "project",
      type,
      text: `${FILLER[index % FILLER.length]}（第 ${index + 1} 次记录）`,
      tags: ["filler"],
    }
  })
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
export async function seeded(options?: {
  settings?: Settings
  embedder?: boolean
  seed?: readonly SeedInput[]
}): Promise<ReturnType<typeof MemorySubsystem.createSubsystem>> {
  const subsystem = MemorySubsystem.createSubsystem({
    store: MemoryReference.createStore(),
    embedder: options?.embedder === true ? MemoryReference.createFakeEmbedder() : undefined,
    settings: options?.settings,
    clock: fixedClock(),
  })
  for (const entry of options?.seed ?? SEED) {
    await subsystem.save({
      scope: entry.scope,
      projectID: entry.scope === "project" ? PROJECT : undefined,
      type: entry.type,
      text: entry.text,
      tags: entry.tags,
      trigger: entry.trigger,
      id: entry.id,
    })
  }
  return subsystem
}
