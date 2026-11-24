import { Ipc } from "@aicraft/plugin/gui"
import { Schema } from "effect"

/**
 * 聊天主界面的 Ipc 契约。main 进程读本地虹云通库并把视图推给窗口；窗口只渲染，不碰 fs。
 * 所有字段都是必填，缺省值由 main 补全，窗口不必做防御性判断。
 */

/** 头像成员：名字决定底色与文字，`headPath` 有真实头像时优先显示图片。 */
export const HeadMember = Schema.Struct({
  name: Schema.String,
  headPath: Schema.String,
})

/** 消息类型，与 `src/chat/message.ts` 的 MessageKind 一致。 */
export const MessageKind = Schema.Literals([
  "text",
  "image",
  "file",
  "voice",
  "video",
  "recall",
  "call",
  "notice",
  "merge",
  "other",
])

/** 会话列表的一行。 */
export const SessionRow = Schema.Struct({
  /** 会话 id：单聊是对方账号，群聊以 g 开头。 */
  id: Schema.String,
  /** 显示名：群名、联系人备注，或最后一条消息的发送人。 */
  name: Schema.String,
  /** 最后一条消息的摘要。 */
  preview: Schema.String,
  /** 最后一条消息的时间，epoch 毫秒。 */
  lastAt: Schema.Number,
  /** 未读数：lastmsg 的计数，减去本次会话里已本地标记已读的会话。 */
  unread: Schema.Number,
  /** 会话里有人 @ 我（或 @所有人）。 */
  atMe: Schema.Boolean,
  /** 群聊。 */
  group: Schema.Boolean,
  /** 对方的在线快照（本地库 `OnLineState = 1`）；群聊恒为 false。 */
  online: Schema.Boolean,
  /** 头像成员：单聊就是对方，群聊是会话内出现过的成员（最多 9 个），窗口按虹云通的拼图规则渲染。 */
  members: Schema.Array(HeadMember),
})

/** 消息流的一条消息。 */
export const MessageRow = Schema.Struct({
  /** 自增 Id，分页游标与 React key 都用它。 */
  id: Schema.Number,
  /** 客户端消息 id，形如 `1795146745802|95360`；已读回执按它关联。 */
  msgId: Schema.String,
  /** 消息类型。 */
  kind: MessageKind,
  /** 正文；图片/文件/语音正文可能为空。 */
  text: Schema.String,
  /** 发送账号。 */
  sender: Schema.String,
  /** 发送人显示名。 */
  senderNick: Schema.String,
  /** 发送人头像文件绝对路径；没有则为空串。 */
  senderHead: Schema.String,
  /** 本人发送。 */
  outgoing: Schema.Boolean,
  /** epoch 毫秒。 */
  createdAt: Schema.Number,
  /** @了我。 */
  atMe: Schema.Boolean,
  /** @ 到的名字，用于正文高亮。 */
  atNames: Schema.Array(Schema.String),
  /** 文件名；合并转发的正文文件名也在里面。 */
  fileName: Schema.String,
  /** 文件大小，字节；未知为 0。 */
  fileSize: Schema.Number,
  /** 本地绝对路径：图片读取、合并转发解码、打开文件都用它。 */
  filePath: Schema.String,
  /**
   * 自己发出的消息的已读回执摘要；别人发来的消息没有这个字段。
   * `unread` 为 -1 表示还没拿到群成员名单，此时界面只报「N 人已读」。
   */
  receipt: Schema.optional(
    Schema.Struct({
      /** 回执数据源是否可用；false 时界面写「已读信息暂不可用」。 */
      available: Schema.Boolean,
      /** 群聊。 */
      group: Schema.Boolean,
      /** 已读人数。 */
      read: Schema.Number,
      /** 未读人数；-1 表示未知。 */
      unread: Schema.Number,
    }),
  ),
})

/** 合并转发里的一条。 */
export const MergeItemRow = Schema.Struct({
  /** 发送账号。 */
  account: Schema.String,
  /** 标题（通常就是正文）。 */
  title: Schema.String,
  /** 正文。 */
  content: Schema.String,
  /** 图片或文本。 */
  kind: Schema.Literals(["text", "image", "other"]),
  /** epoch 毫秒；0 表示未知。 */
  time: Schema.Number,
})

/** 一条 AI 草稿。文件由另一个会话写入，这里只读。 */
export const DraftRow = Schema.Struct({
  /** 草稿 id。 */
  id: Schema.String,
  /** 目标会话。 */
  sessionId: Schema.String,
  /** 草稿正文。 */
  text: Schema.String,
  /** epoch 毫秒；0 表示未知。 */
  createdAt: Schema.Number,
  /** 生成原因或依据，已由写入方写成短句。 */
  note: Schema.String,
})

/** 通讯录成员，用于 @ 选人。 */
export const MemberRow = Schema.Struct({
  /** 账号，cs… 开头。 */
  account: Schema.String,
  /** 姓名。 */
  name: Schema.String,
  /** 部门全名。 */
  department: Schema.String,
  /** 头像文件绝对路径；没有则为空串。 */
  headPath: Schema.String,
  /** 在线快照（本地库 `OnLineState = 1`）。 */
  online: Schema.Boolean,
})

/** 知识库命中提示。第一版没有写入方，保持空数组。 */
export const KnowledgeHit = Schema.Struct({
  /** 条目标题。 */
  title: Schema.String,
  /** 摘要。 */
  snippet: Schema.String,
})

/** 一张头像的读取结果：`dataUrl` 为空串表示文件不存在或读不到。 */
export const AvatarEntry = Schema.Struct({
  /** 主进程记下的绝对路径，窗口按它配对。 */
  path: Schema.String,
  /** `data:<mime>;base64,…`，失败为空串。 */
  dataUrl: Schema.String,
})

/** 全局消息搜索的一条命中。 */
export const SearchHit = Schema.Struct({
  /** 所属会话。 */
  sessionId: Schema.String,
  /** 会话显示名。 */
  sessionName: Schema.String,
  /** 命中的消息。 */
  message: MessageRow,
})

/** 已读回执里的一个人。 */
export const ReceiptPerson = Schema.Struct({
  /** 账号。 */
  account: Schema.String,
  /** 显示名；读不到时退回账号。 */
  name: Schema.String,
  /** 已读时间 epoch 毫秒；未读为 0。 */
  at: Schema.Number,
})

/** 一条自己发出的消息的回执名单。 */
export const ReceiptView = Schema.Struct({
  /** 回执是否可用：桥接还没连过、或离线期间的回执补不回来时为 false。 */
  available: Schema.Boolean,
  /** 群聊。 */
  group: Schema.Boolean,
  /** 已读的人，按时间倒序。 */
  read: Schema.Array(ReceiptPerson),
  /** 未读的人；群成员名单还没拿到时为空。 */
  unread: Schema.Array(ReceiptPerson),
})

/** 页面阶段：决定窗口显示整页空态还是三栏内容。 */
export const Phase = Schema.Literals(["loading", "ready", "no-account", "no-data", "error"])

/** 连接与能力状态。 */
export const ChatStatus = Schema.Struct({
  /** 页面阶段。 */
  phase: Phase,
  /** 技术细节：数据目录、错误原文，不翻译，也不当文案展示在标题里。 */
  detail: Schema.String,
  /** 当前账号，例如 csT1002173。 */
  account: Schema.String,
  /** 当前账号的显示名。 */
  displayName: Schema.String,
  /** 是否发现运行中的 bridge（Config/bridge.json）。 */
  bridge: Schema.Literals(["ready", "missing"]),
  /** AI 托管是否开启（profile.capabilities.autopilot.enabled）。 */
  autopilot: Schema.Boolean,
  /** 合并后的发送白名单条目数。 */
  whitelist: Schema.Number,
})

/** 输入区的可用状态；reason 是 i18n key 的后缀，窗口负责翻译。 */
export const SendState = Schema.Struct({
  /** 可以点发送。只有没有打开会话时才为 false。 */
  enabled: Schema.Boolean,
  /** 禁用原因：空串表示没有原因。 */
  reason: Schema.Literals(["", "whitelist-empty", "not-allowed", "bridge-missing", "pending"]),
})

/** 窗口看到的整页状态。 */
export const ChatState = Schema.Struct({
  /** 阶段与连接信息。 */
  status: ChatStatus,
  /** 左栏会话列表，按最后消息时间倒序。 */
  sessions: Schema.Array(SessionRow),
  /** 当前会话 id；没有会话时为空串。 */
  selected: Schema.String,
  /** 当前会话已加载的消息，旧→新。 */
  messages: Schema.Array(MessageRow),
  /** 还有更早的消息。 */
  hasMore: Schema.Boolean,
  /** 当前会话「新消息」分界的消息 id：进入会话那一刻的第一条未读，0 表示不分隔。 */
  newMessageId: Schema.Number,
  /** 所有会话的未读总数，供导航角标使用。 */
  unread: Schema.Number,
  /** 左栏搜索结果。 */
  search: Schema.Struct({
    /** 当前查询词。 */
    query: Schema.String,
    /** 命中列表。 */
    hits: Schema.Array(SearchHit),
  }),
  /** 最近草稿。 */
  drafts: Schema.Array(DraftRow),
  /** @ 选人用的成员表。 */
  members: Schema.Array(MemberRow),
  /** 输入区状态。 */
  send: SendState,
  /** 知识库命中。 */
  knowledge: Schema.Array(KnowledgeHit),
  /** 回执版本号：收到新回执时自增，窗口据此重新取弹窗名单。 */
  receiptsVersion: Schema.Number,
})

/** 聊天主界面的 Ipc。state 是每个窗口一份的快照，方法改完就推新的。 */
export const ChatIpc = Ipc.define({
  id: "changhong.aicraft.hyt.chat",
  state: ChatState,
  methods: {
    /** 重新读库：会话列表、当前会话最新一页、未读、草稿。窗口每 4 秒调用一次。 */
    refresh: {},
    /** 切换当前会话，并载入它最新一页消息；给了 `messageId` 就改载那条消息所在的一页。 */
    selectSession: { input: Schema.Struct({ sessionId: Schema.String, messageId: Schema.optional(Schema.Number) }) },
    /** 载入更早的一页消息。 */
    loadMore: {},
    /** 跨会话搜索消息正文、发送人、文件名。空查询清空结果。 */
    search: { input: Schema.Struct({ query: Schema.String }) },
    /** 本地标记已读：只改本窗口的未读显示，不回写客户端库。 */
    markRead: { input: Schema.Struct({ sessionId: Schema.String }) },
    /** 一键阅读：把所有会话的未读都标为已读，并写回客户端库。 */
    markAllRead: {},
    /** 发送消息：直接走客户端消息通道，成功后写回本地库并刷新。 */
    send: {
      input: Schema.Struct({ sessionId: Schema.String, text: Schema.String, at: Schema.Array(Schema.String) }),
      output: Schema.Struct({ ok: Schema.Boolean, reason: Schema.String }),
    },
    /** 解开一条合并转发。 */
    merge: {
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ items: Schema.Array(MergeItemRow), error: Schema.String }),
    },
    /** 读一张自己发出的消息的已读回执名单；`retry` 会忽略成员缓存重新拉一次群成员。 */
    receipts: {
      input: Schema.Struct({
        sessionId: Schema.String,
        msgId: Schema.String,
        /** 消息发出时间：用来判断这条回执是否还补得回来。 */
        createdAt: Schema.Number,
        retry: Schema.optional(Schema.Boolean),
      }),
      output: ReceiptView,
    },
    /** 读一张图片，返回 data URL，供窗口内联显示。 */
    media: {
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ dataUrl: Schema.String, error: Schema.String }),
    },
    /** 批量读头像，最多 200 张；按路径与 mtime 在主进程缓存。 */
    avatars: {
      input: Schema.Struct({ paths: Schema.Array(Schema.String) }),
      output: Schema.Array(AvatarEntry),
    },
  },
})

// 同时导出同名类型：值空间是 Schema，类型空间是它的 Type，调用方写 `MessageRow` 不必区分两者。
export type HeadMember = typeof HeadMember.Type
export type MessageKind = typeof MessageKind.Type
export type SessionRow = typeof SessionRow.Type
export type MessageRow = typeof MessageRow.Type
export type MergeItemRow = typeof MergeItemRow.Type
export type AvatarEntry = typeof AvatarEntry.Type
export type DraftRow = typeof DraftRow.Type
export type MemberRow = typeof MemberRow.Type
export type KnowledgeHit = typeof KnowledgeHit.Type
export type SearchHit = typeof SearchHit.Type
export type ReceiptPerson = typeof ReceiptPerson.Type
export type ReceiptView = typeof ReceiptView.Type
export type Phase = typeof Phase.Type
export type ChatStatus = typeof ChatStatus.Type
export type SendState = typeof SendState.Type
export type ChatState = typeof ChatState.Type
