import type { Context } from "@opencode/plugin/gui"
import { For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { Avatar } from "./avatar.js"
import type { MemberRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"

/**
 * 右栏会话信息面板：照设计图 `docs/standard/design/prototypes/hyt-chat.html` 1:1（08 §8 第三列）。
 *
 * 只填本地库真查得到的字段——群名、成员、部门、在线快照来自 `Person`；
 * 图上「群简介」「群人数」「群主标签」「查看更多」在虹云通本地库里没有对应列，因此不画，
 * 免得用假数字撑版面。
 * 设置、邀请、改名和四个快捷工具都没有客户端接口可调，点击给同一条真实提示（与输入区的附件键一致）。
 */
export function InfoPanel(props: {
  ctx: Context
  session: SessionRow | undefined
  members: readonly MemberRow[]
  account: string
  avatars: Readonly<Record<string, string>>
  onNotice: (message: string, tone: "warning") => void
}) {
  const ctx = props.ctx
  /** 面板只在打开会话时出现：没选会话就没有可展示的对象。 */
  const open = () => props.session !== undefined
  const group = () => props.session?.group === true
  /** 单聊面板里的那一个人就是对方；群聊用近期发言的人。 */
  const people = () =>
    group()
      ? props.members.slice(0, 12)
      : props.members.filter((member) => member.account !== props.account).slice(0, 1)
  const partner = () => props.members.find((member) => member.account !== props.account)
  const sub = () => {
    if (group()) return text(ctx, "hyt.chat.head.members", { count: props.members.length })
    const department = partner()?.department ?? ""
    return department.length > 0 ? department : text(ctx, "hyt.chat.head.unreadOnly")
  }
  const title = () =>
    group()
      ? text(ctx, "hyt.chat.info.members.group", { count: people().length })
      : text(ctx, "hyt.chat.members.title")
  /** 状态点只作辅助：同一行一定跟着「在线」文字（09 §状态点）。 */
  const status = (member: MemberRow) =>
    member.online
      ? member.department.length > 0
        ? `${text(ctx, "hyt.chat.user.online")} · ${member.department}`
        : text(ctx, "hyt.chat.user.online")
      : member.department

  const notWired = () => props.onNotice(text(ctx, "hyt.chat.info.notWired"), "warning")

  return (
    <Show when={open()}>
      <aside class="hyt-chat-info" aria-label={text(ctx, "hyt.chat.head.info")}>
        <div class="hyt-chat-info-hero">
          <Avatar
            name={props.session?.name ?? ""}
            members={props.session?.members ?? []}
            avatars={props.avatars}
            size="panel"
            group={group()}
          />
          <div class="hyt-chat-info-name">
            {props.session?.name ?? ""}
            <button
              type="button"
              class="hyt-chat-icon"
              aria-label={text(ctx, "hyt.chat.info.edit")}
              title={text(ctx, "hyt.chat.info.edit")}
              onClick={notWired}
            >
              <Line>
                <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                <path d="m14.5 6.5 3 3" />
              </Line>
            </button>
          </div>
          <Show when={sub().length > 0}>
            <div class="hyt-chat-info-sub">{sub()}</div>
          </Show>
          <Show when={group()}>
            <div class="hyt-chat-info-actions">
              <button type="button" class="hyt-chat-info-button" onClick={notWired}>
                <Line>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4M17.9 17.9l-1.4-1.4M7.5 7.5 6.1 6.1" />
                </Line>
                {text(ctx, "hyt.chat.info.settings")}
              </button>
              <button type="button" class="hyt-chat-info-button" onClick={notWired}>
                <Line>
                  <circle cx="10" cy="8.5" r="3.2" />
                  <path d="M4 19a6 6 0 0 1 12 0M18 8v6M15 11h6" />
                </Line>
                {text(ctx, "hyt.chat.info.invite")}
              </button>
            </div>
          </Show>
        </div>

        <div class="hyt-chat-info-section">
          <span>{title()}</span>
          <Show when={group()}>
            <button
              type="button"
              class="hyt-chat-icon"
              aria-label={text(ctx, "hyt.chat.info.searchMembers")}
              title={text(ctx, "hyt.chat.info.searchMembers")}
              onClick={notWired}
            >
              <Line>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </Line>
            </button>
          </Show>
        </div>
        <Show
          when={people().length > 0}
          fallback={<div class="hyt-chat-member-status">{text(ctx, "hyt.chat.members.empty")}</div>}
        >
          <For each={people()}>
            {(member) => (
              <div class="hyt-chat-member">
                <span class="hyt-chat-face" data-status={member.online ? "online" : "offline"}>
                  <Avatar name={member.name} members={[{ name: member.name, headPath: member.headPath }]} avatars={props.avatars} size="head" />
                  <Show when={member.online}>
                    <span class="hyt-chat-face-dot" aria-hidden="true" />
                  </Show>
                </span>
                <span class="hyt-chat-member-text">
                  <span class="hyt-chat-member-name">{member.name}</span>
                  <Show when={status(member).length > 0}>
                    <span class="hyt-chat-member-status">{status(member)}</span>
                  </Show>
                </span>
              </div>
            )}
          </For>
        </Show>

        <div class="hyt-chat-info-section">
          <span>{text(ctx, "hyt.chat.info.tools")}</span>
        </div>
        <div class="hyt-chat-tools">
          <For each={TOOLS}>
            {(tool) => (
              <button type="button" class="hyt-chat-tool" onClick={notWired}>
                <Line>{tool.icon()}</Line>
                {text(ctx, tool.label)}
              </button>
            )}
          </For>
        </div>
      </aside>
    </Show>
  )
}

/** 四个快捷工具：线稿照设计图，行为都还没有客户端接口可调。 */
const TOOLS = [
  {
    label: "hyt.chat.info.tool.meeting",
    icon: () => (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
      </>
    ),
  },
  {
    label: "hyt.chat.info.tool.docs",
    icon: () => (
      <>
        <path d="M6 3.5h8l4 4v13H6v-17Z" />
        <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
      </>
    ),
  },
  {
    label: "hyt.chat.info.tool.board",
    icon: () => (
      <>
        <rect x="3.5" y="4.5" width="7" height="15" rx="1.5" />
        <rect x="13.5" y="4.5" width="7" height="9" rx="1.5" />
      </>
    ),
  },
  {
    label: "hyt.chat.info.tool.it",
    icon: () => (
      <>
        <path d="M5 13a7 7 0 0 1 14 0" />
        <rect x="3.5" y="13" width="3.5" height="5.5" rx="1.5" />
        <rect x="17" y="13" width="3.5" height="5.5" rx="1.5" />
      </>
    ),
  },
] as const

/** 统一的 24 线稿容器：宿主图标库没有这些形状，照设计图内联。 */
function Line(props: { children: JSX.Element }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}
