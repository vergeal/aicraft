import { Show } from "solid-js"
import type { HeadMember } from "./contract.js"
import { headColor, headText } from "./head.js"

/** 头像尺寸档：会话行 36、搜索 32、会话头 28、消息 36、@ 候选 22、成员 24。 */
export type AvatarSize = "session" | "row" | "head" | "bubble" | "mention" | "member"

const SIZE: Record<AvatarSize, number> = {
  session: 36,
  row: 32,
  head: 28,
  bubble: 36,
  mention: 22,
  member: 24,
}

/** 形状与虹云通 `avatarRadius` 一致：正方形 + 12% 圆角。 */
function radius(size: number) {
  return Math.max(3, Math.round(size * 0.12))
}

/**
 * 一个人或一个群的头像。
 *
 * 单人是方形圆角图片，没有图片时显示名称末两个字的彩色块；群聊不拼成员九宫格——36px 的格子里
 * 九张脸只会糊成一片，改成自绘的双人剪影，底色仍按群名取色，列表里一眼能和单聊分开。
 */
export function Avatar(props: {
  name: string
  members: readonly HeadMember[]
  avatars: Readonly<Record<string, string>>
  size: AvatarSize
  /** 群聊：画群图标，而不是取成员头像。 */
  group?: boolean
}) {
  const size = () => SIZE[props.size]
  const single = () => (props.members.length === 1 ? props.members[0] : undefined)
  const name = () => single()?.name.trim() || props.name.trim()
  const source = () => {
    const headPath = single()?.headPath ?? ""
    return headPath.length === 0 ? "" : (props.avatars[headPath] ?? "")
  }
  const pending = () => {
    const headPath = single()?.headPath ?? ""
    return headPath.length > 0 && props.avatars[headPath] === undefined
  }
  const faceSize = (box: number) => Math.max(8, Math.floor(Math.min(box * 0.42, (box * 0.9) / 2)))

  return (
    <span
      class="hyt-chat-avatar"
      data-group={props.group ? "true" : undefined}
      aria-hidden="true"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": `${radius(size())}px`,
        "background-color": headColor(name()),
        "font-size": `${faceSize(size())}px`,
      }}
    >
      <Show
        when={props.group === true}
        fallback={
          <Show when={source().length > 0} fallback={pending() ? "" : headText(name())}>
            <img src={source()} alt="" loading="lazy" />
          </Show>
        }
      >
        <svg class="hyt-chat-avatar-group" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="9.3" cy="8.2" r="3.1" fill="currentColor" />
          <path d="M3.5 19.8c0-2.7 2.6-4.6 5.8-4.6s5.8 1.9 5.8 4.6v.2H3.5v-.2Z" fill="currentColor" />
          <circle cx="16.8" cy="9.4" r="2.35" fill="currentColor" opacity=".55" />
          <path
            d="M15.3 13.9c3 .1 5.2 1.9 5.2 4.4v1.7h-4.1c.1-2.3-.8-4.4-2.4-5.9.4-.1.9-.2 1.3-.2Z"
            fill="currentColor"
            opacity=".55"
          />
        </svg>
      </Show>
    </span>
  )
}
