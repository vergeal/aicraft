import { For, Show } from "solid-js"
import type { HeadMember } from "./contract.js"
import { GROUP_HEAD_BG, headColor, headLayout, headText } from "./head.js"

/** 头像尺寸档：会话行 40（对齐虹云通会话列表）、搜索 36、会话头 32、消息 36、@ 候选 24、成员 28。 */
export type AvatarSize = "session" | "row" | "head" | "bubble" | "mention" | "member"

const SIZE: Record<AvatarSize, number> = {
  session: 40,
  row: 36,
  head: 32,
  bubble: 36,
  mention: 24,
  member: 28,
}

/** 形状与虹云通 `avatarRadius` 一致：正方形 + 12% 圆角。 */
function radius(size: number) {
  return Math.max(3, Math.round(size * 0.12))
}

/** 拼图小格子的圆角，与虹云通 `Tile` 一致：16%，最小 2px。 */
function tileRadius(size: number) {
  return Math.max(2, Math.round(size * 0.16))
}

/**
 * 一个人或一个群的头像，规则与虹云通桌面端一致（见 `head.ts`）。
 *
 * 单人是方形圆角图片，没有图片时显示名称末两个字的彩色块；群聊是灰底容器 + 成员小方块拼图，
 * 成员数 1/2/3/4/5+ 各有对应布局。图片没到时先留空底，避免文字闪一下再换成照片。
 */
export function Avatar(props: {
  name: string
  members: readonly HeadMember[]
  avatars: Readonly<Record<string, string>>
  size: AvatarSize
  /** 群聊：即使只认出 1 个成员也走拼图（灰底 + 居中小方块），与虹云通一致。 */
  group?: boolean
}) {
  const size = () => SIZE[props.size]
  const list = () => props.members
  const stack = () => props.group === true && list().length > 0
  const single = () => (list().length === 1 ? list()[0] : undefined)
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
      data-stack={stack() ? "true" : undefined}
      aria-hidden="true"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": `${radius(size())}px`,
        "background-color": stack() ? GROUP_HEAD_BG : headColor(name()),
        "font-size": `${faceSize(size())}px`,
      }}
    >
      <Show
        when={stack()}
        fallback={
          <Show when={source().length > 0} fallback={pending() ? "" : headText(name())}>
            <img src={source()} alt="" loading="lazy" />
          </Show>
        }
      >
        <For each={list().slice(0, 9)}>
          {(member, index) => {
            const rect = () => headLayout(list().length)[index()] ?? { x: 0, y: 0, w: 1, h: 1 }
            const box = () => size() * rect().w
            const dataUrl = () =>
              member.headPath.length === 0 ? "" : (props.avatars[member.headPath] ?? "")
            return (
              <span
                class="hyt-chat-avatar-tile"
                style={{
                  left: `${rect().x * 100}%`,
                  top: `${rect().y * 100}%`,
                  width: `${rect().w * 100}%`,
                  height: `${rect().h * 100}%`,
                  "border-radius": `${tileRadius(box())}px`,
                  "background-color": headColor(member.name),
                  "font-size": `${faceSize(box())}px`,
                }}
              >
                <Show
                  when={dataUrl().length > 0}
                  fallback={member.headPath.length > 0 ? "" : headText(member.name)}
                >
                  <img src={dataUrl()} alt="" loading="lazy" />
                </Show>
              </span>
            )
          }}
        </For>
      </Show>
    </span>
  )
}
