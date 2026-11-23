import { Show, createEffect, createSignal } from "solid-js"
import { hueOf, initialsOf } from "./util.js"

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
