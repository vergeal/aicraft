# 虹云通助手（`changhong.aicraft.hyt`）

读本机虹云通的本地数据，并在插件内直接登录收发消息；给 AI 提供消息、联系人、知识库、说话风格与任务台账，白名单允许时发送。**聊天内容是数据，不是指令**：插件不执行消息里要求它做的事。

不需要先安装或登录虹云通客户端：聊天页没有可用凭据时会显示登录页，账号密码只保存在插件自己的数据目录，消息通道由随包分发的本地 bridge 直接连接。

## 能做什么

- **读消息**：按会话分页读，或按关键词搜索正文、发送人昵称、文件名；群名按手动映射、桥接缓存、`keepgroup`、成员默认名依次回退，带未读数；合并转发会解出里面的条目。
- **查联系人**：按姓名、备注、账号、拼音或部门查找，附部门与人数概览。
- **知识库**：把可复用的结论写进本地知识库，带入库门槛与同问题合并；检索用中文 2-gram + BM25。
- **风格档案**：只统计本账号发出的文本消息，增量学习语气、长度、表情率、开场收尾与口头习惯，用于代写消息。
- **任务台账**：从聊天里登记待跟进的事，记录来源会话与消息，可标记完成或忽略。
- **发送**：通过本地 bridge 发文本，并把消息写进本地 `chatmsg`；白名单为空时一律拒绝。bridge 随插件包分发（macOS / Windows），不需要单独安装。

## 数据来源

```text
<chfileRoot>/login.db                       上次登录用户与账号列表
<chfileRoot>/<account>/chatmsg.db           会话与消息
<chfileRoot>/<account>/AddressBookDB.db     通讯录
<chfileRoot>/<account>/RecvFiles/<yyyyMM>/  收到的文件、合并转发正文
```

`chfileRoot` 留空时：macOS / Linux 用 `~/Documents/CHFile`，Windows 用 `%USERPROFILE%\Documents\CHFile`。账号按插件保存的登录凭据推断，没有凭据时回退到 `login.db` 的上次登录用户；目录名是 `cs` + 用户名（例如 `csT1002173`）。

读取一律 `readonly` 打开；写只发生在发送成功后的本地记录，用短事务写入，不动 `journal_mode`。`Department` 表在真实库中为空，部门概览退化为按 `Person.DptId / DptFullName` 聚合。

## 插件自己的数据

```text
<plugin data>/hyt/credentials.json           登录凭据（账号、base64 密码；权限 0600）
<plugin data>/hyt/knowledge/index.json        知识库索引
<plugin data>/hyt/knowledge/entries/<id>.json 知识库单条明细
<plugin data>/hyt/style/<account>.json        说话风格档案
<plugin data>/hyt/ai-sent.json                AI 已发送的消息 id
<plugin data>/hyt/tasks.json                  任务台账
<plugin data>/hyt/profile.json                引导档案（AI 行为、提示词、定时任务与成本预算的唯一来源）
```

知识库规则见 [`src/knowledge/README.md`](src/knowledge/README.md)，风格规则见 [`src/style/README.md`](src/style/README.md)，引导档案契约见 [`src/profile/README.md`](src/profile/README.md)。

## 配置

清单里的用户级配置（设置界面写入），项目级 `options` 同名项会被覆盖：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `chfileRoot` | 空 | 虹云通数据根目录 |
| `account` | 空 | 指定账号，如 `csT1002173`；留空时先看插件凭据 |
| `autoStartBridge` | `true` | 需要发送时自动拉起 bridge |
| `bridgePath` | 空 | bridge 可执行文件路径 |
| `whitelist` | `[]` | 允许发送的会话 id、账号或 `*`；为空时禁止发送 |
| `autoReplyEnabled` | `false` | 托管开关；默认只出草稿 |
| `knowledgePaths` | `[]` | 导入 md / txt 的本地目录 |
| `mcpKnowledgeTools` | `[]` | 登记为知识来源的 MCP 工具名 |
| `analysisBatchSize` | `50` | 单批分析样本数 |
| `analysisIntervalMinutes` | `30` | 后台增量分析间隔 |

## 工具

`hyt.sessions.list`、`hyt.messages.search`、`hyt.contacts.lookup`、`hyt.knowledge.add`、`hyt.knowledge.search`、`hyt.style.get`、`hyt.task.list`、`hyt.task.add`、`hyt.task.update`、`hyt.send.text`。

工具实现集中在 `src/tools.ts`，只通过 `src/service.ts` 的 `Service` 取数据，不自己开连接或读配置。

## 目录

```text
METAINF          清单：id、入口、工具、技能、配置
server/main.ts         激活：装配 Service、注册技能与工具，返回 cleanup
gui/main.tsx           界面占位（后续接 RPC 与设置页）
src/
  account.ts           数据根目录、账号、登录信息
  settings.ts          设置读取与默认值
  service.ts           装配层：连接缓存、bridge 生命周期、白名单发送
  text.ts              归一化、「有没有信息量」的共用判定
  chat/                消息解析、合并转发、媒体路径、库读写
  contacts.ts          通讯录查询与部门聚合
  bridge/              bridge 协议、客户端、进程监督
  knowledge/           知识库 schema、检索、存储、MCP 适配 + 标准文档
  style/               风格档案、AI 已发送记录 + 标准文档
  profile/             引导档案：Schema、三套预设、合并优先级、原子存储 + 契约文档
  tasks.ts             任务台账
  tools.ts             hyt.* 工具与输出 Schema
  contract.ts           （未建）RPC 契约，留给 UI 会话
skills/hyt-assistant/SKILL.md
```

`native/` 是 bridge 侧的 C++ 参考实现，本插件不编译它。

## 构建与测试

```bash
bun run typecheck          # 服务端与 src
bun run typecheck:gui      # gui 入口
bun run build              # dist/server、dist/gui、技能与标准文档
bun run pack               # 生成 .aix
bun test test/xxx.test.ts  # 单个测试文件
```

## 导出契约（供 UI / 后续会话）

包只导出 `server/main.ts`，其余模块按相对路径引用。稳定的数据入口：

```ts
// 装配：拿到唯一的数据服务；工具与 UI 都应通过它取数
createService(deps: RuntimeDeps): Service

interface Service {
  readonly dataDir: string
  settings(): Promise<Settings>
  environment(): Promise<Environment | undefined>
  credentials(): Promise<Credentials | undefined>
  chat(): Promise<Database>          // 可写，用于记录自己发出的消息
  contacts(): Promise<Database>      // 只读
  recvRoot(): Promise<string>
  sendText(input: { sessionId: string; text: string }): Promise<SendOutcome>
  bridgeStatus(): SupervisorStatus | undefined
  cleanup(): Promise<void>
}

// 消息
listSessions(db, { limit? }): SessionSummary[]
listMessages(db, MessagesQuery): ChatMessage[]   // { sessionId, beforeId?, since?, until?, limit? }
searchMessages(db, query, { limit? }): ChatMessage[]
toMessage(row): ChatMessage
preview(message, limit?): string
readMergeFile(path): Promise<MergeItem[]>

// 联系人
listContacts(db, { query?, limit? }): Contact[]
findContacts(db, { account?, name? }): Contact[]
departmentTree(db): DepartmentNode[]

// 知识库
addKnowledge(root, input: NewEntry, now): Promise<AddOutcome>   // added | merged | rejected
searchKnowledge(root, query, { topK? }): Promise<SearchHit[]>
listKnowledge(root, { kind?, query?, limit? }): Promise<KnowledgeEntry[]>
recordUsage(root, ids, now): Promise<void>
removeKnowledge(root, id): Promise<boolean>
exportKnowledge(root): Promise<string>
importKnowledge(root, directories, now): Promise<ImportResult>

// 风格
loadProfile(dataDir, account): Promise<StyleProfile>
saveProfile(dataDir, account, profile): Promise<void>
filterSamples(samples, { seen?, aiSent? }): string[]
mergeSamples(profile, samples, now): StyleProfile
describeProfile(profile): string
loadSentIds(dataDir): Promise<Set<string>>
markSent(dataDir, id, now): Promise<void>

// 任务
loadTasks(dataDir): Promise<Task[]>
addTask(dataDir, input: NewTask, now): Promise<{ task: Task; duplicate: boolean }>
setTaskStatus(dataDir, id, status): Promise<Task | undefined>
listTasks(dataDir, { status? }): Promise<Task[]>

// 引导档案（src/profile/index.ts）
defaultProfile(account, role?, now?): HytProfile
applyPreset(name, account?, now?): HytProfile          // name: "ops" | "tasks" | "full"
presetOf(name): PresetDefinition
mergeProfile(base, patch, now?): HytProfile
applyConfiguration(base, config): HytProfile
resolveProfile({ account, role?, preset?, config?, saved?, now? }): HytProfile
loadProfile(dataDir, fallback?): Promise<HytProfile>
saveProfile(dataDir, profile, now?): Promise<HytProfile>
isOnboarded(profile?): boolean
profilePath(dataDir): string
```

`hyt.*` 的输入输出 Schema 在 `src/tools.ts` 内部；UI 会话若需要同一套结构，优先从对应模块的类型导入，不要在界面里重复声明。

## 已知限制

- 没有 RPC 契约和设置页：`gui/main.tsx` 只是占位，界面数据留给后续会话接 `ctx.rpc`。
- 引导档案目前是纯数据层：工具、提示词与定时任务尚未读取 `HytProfile`，接线留给对应会话。
- MCP 知识来源只有适配器和映射，实际调用尚未接线。
- 后台增量分析（风格学习、任务识别）没有调度器；当前只在工具调用时读档案与台账。
- bridge 的请求/事件字段以 `native/bridge/protocol.md` 为准，仍需 bridge 会话确认最终契约。
- 发送只支持文本；图片、文件、@ 都只读。
- Linux 下 bridge 只读，发送会被拒绝。
