import type { Context } from "@opencode/plugin/gui"
import { For, Show } from "solid-js"
import type { AvatarTone } from "./contract.js"
import { initials } from "./util.js"
/** 头像尺寸档：会话行 32、中栏会话头 32、消息 40、@ 候选 24。 */
export type AvatarSize = "row" | "head" | "bubble" | "mention"

/**
 * 一个人或一个群的头像。
 *
 * 有真实头像就显示图片；群聊最多拼 4 张，2×2，外框统一裁成圆形。
 * 读不到头像时退回 Discord 那种圆形首字：同一个 id 稳定散列出色，所有头像都是圆，不会破坏排列。
 */
export function Avatar(props: {
  ctx: Context
  name: string
  tone: AvatarTone
  paths: readonly string[]
  avatars: Readonly<Record<string, string>>
  size: AvatarSize
}) {
  const images = () =>
    props.paths.flatMap((path) => {
      const dataUrl = props.avatars[path]
      return dataUrl === undefined || dataUrl.length === 0 ? [] : [dataUrl]
    })
  // 已知有头像文件、只是 data URL 还没到时先留空底，避免首字闪一下再换成照片。
  const pending = () =>
    props.paths.length > 0 &&
    images().length === 0 &&
    props.paths.some((path) => props.avatars[path] === undefined)

  return (
    <span
      class="hyt-chat-avatar"
      data-tone={props.tone}
      data-size={props.size}
      data-count={Math.min(images().length, 4)}
      data-pending={pending() ? "true" : undefined}
      aria-hidden="true"
    >
      <Show when={images().length > 0} fallback={pending() ? "" : initials(props.name)}>
        <Show
          when={images().length === 1}
          fallback={
            <span class="hyt-chat-avatar-grid" data-count={images().length}>
              <For each={images()}>{(source) => <img src={source} alt="" loading="lazy" />}</For>
            </span>
          }
        >
          <img class="hyt-chat-avatar-photo" src={images()[0]} alt="" loading="lazy" />
        </Show>
      </Show>
    </span>
  )
}
