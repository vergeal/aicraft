import { Show, createEffect, createSignal } from "solid-js"
import { hueOf, initialsOf } from "./util.js"

/** 头像路径 → 主进程解码好的 data URL；还没取到就返回 undefined，头像退回首字。 */
export function avatarOf(map: Record<string, string>, path: string | undefined) {
  if (path === undefined || path.length === 0) return undefined
  const value = map[path]
  return value === undefined || value.length === 0 ? undefined : value
}

/**
 * 群聊默认头像。
 *
 * 群没有「脸」：拿第一个成员的头像顶上，会让一个群看起来像某个人，成员一变头像就跟着变。
 * 这里是一枚固定的身份标：蓝底上前后两个人，群聊一律用它。
 */
export function GroupMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill="#3f6ee8" />
      <g fill="#9db8f5">
        <circle cx="16" cy="8.7" r="2.8" />
        <path d="M12.9 16.7a3.1 3.1 0 0 1 6.2 0z" />
      </g>
      <g fill="#ffffff">
        <circle cx="9.2" cy="9.9" r="3.3" />
        <path d="M4.9 17.8a4.3 4.3 0 0 1 8.6 0z" />
      </g>
    </svg>
  )
}

/** 群聊头像框：尺寸、圆角与普通头像一致，只换里面的图。 */
export function GroupFace(props: { class?: string; small?: boolean; size?: number }) {
  return (
    <span
      class={props.small === true ? "face face--sm face--group" : `face face--group${props.class === undefined ? "" : ` ${props.class}`}`}
      style={props.size === undefined ? undefined : { width: `${props.size}px`, height: `${props.size}px` }}
      aria-hidden="true"
    >
      <GroupMark />
    </span>
  )
}

/**
 * 头像：有本地图片就铺图，没有就用名字里的两个字。
 * 底色只由名字散列决定（`data-hue`），与设计稿的两种底色对应。
 * 图片解码失败时退回文字，不留浏览器默认的破图图标。
 */
export function Face(props: {
  name: string
  src?: string
  class?: string
  small?: boolean
  size?: number
}) {
  const [broken, setBroken] = createSignal(false)
  let last: string | undefined
  createEffect(() => {
    if (props.src === last) return
    last = props.src
    setBroken(false)
  })
  const source = () => {
    const value = props.src
    if (broken() || value === undefined || value.length === 0) return undefined
    return value
  }

  return (
    <span
      class={props.small === true ? "face face--sm" : (props.class ?? "face")}
      data-hue={hueOf(props.name)}
      style={props.size === undefined ? undefined : { width: `${props.size}px`, height: `${props.size}px`, "font-size": "13px" }}
      aria-hidden="true"
    >
      <Show when={source()} fallback={initialsOf(props.name)}>
        {(src) => <img src={src()} alt="" onError={() => setBroken(true)} />}
      </Show>
    </span>
  )
}
