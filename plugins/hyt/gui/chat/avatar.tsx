import { For, Show } from "solid-js"
import type { HeadMember } from "./contract.js"
import { GROUP_HEAD_BG, headColor, headLayout, headText } from "./head.js"

/**
 * 头像尺寸档（照设计图）：信息面板 72、会话行 40、消息 36、会话头与成员行 32、@ 候选 24。
 * 字号按位置给：两个字的名字要留在圆内，图上 40 用 14、36 用 13、72 用 18。
 */
export type AvatarSize = "panel" | "session" | "head" | "bubble" | "mention"

const SIZE: Record<AvatarSize, number> = {
  panel: 72,
  session: 40,
  head: 32,
  bubble: 36,
  mention: 24,
}

const FACE: Record<AvatarSize, number> = {
  panel: 18,
  session: 14,
  head: 12,
  bubble: 13,
  mention: 9,
}

/** 拼图小格子的圆角，与虹云通 `Tile` 一致：16%，最小 2px。 */
function tileRadius(size: number) {
  return Math.max(2, Math.round(size * 0.16))
}

/**
 * 格子里放几个字：虹云通固定两个字，但 5 人以上的九宫格每格只有 13px，
 * 两个汉字要 16px，必然被裁成碎字。放不下时只显示一个字，字号随格子宽度收缩。
 */
function tileChars(box: number) {
  return box >= 16 ? 2 : 1
}

/** 格子里的字号：按格子宽度和字数算，保证文字落在格子内。 */
function tileFaceSize(box: number, chars: number) {
  return Math.max(7, Math.min(11, Math.floor((box * 0.92) / chars)))
}

/**
 * 一个人或一个群的头像，规则与虹云通桌面端一致（见 `head.ts`）。
 *
 * 单人是圆形图片，没有图片时显示名称末两个字的彩色块；群聊是灰底容器 + 成员小方块拼图，
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
  // 群与机器人是圆角方块，个人是圆形：形状用来区分身份（06 §4），尺寸越大圆角越大（72 → 16）。
  const radius = () => (stack() ? (size() >= 64 ? "16px" : size() >= 36 ? "10px" : "8px") : "50%")

  return (
    <span
      class="hyt-chat-avatar"
      data-stack={stack() ? "true" : undefined}
      data-shape={stack() ? "block" : undefined}
      aria-hidden="true"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": radius(),
        "background-color": stack() ? GROUP_HEAD_BG : headColor(name()),
        "font-size": `${FACE[props.size]}px`,
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
            const chars = () => tileChars(box())
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
                  "font-size": `${tileFaceSize(box(), chars())}px`,
                }}
              >
                <Show
                  when={dataUrl().length > 0}
                  fallback={headText(member.name, chars())}
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
