import { Show } from "solid-js"
import { hueOf, initialsOf } from "./util.js"

/**
 * 头像：有本地图片就铺图，没有就用名字里的两个字。
 * 底色只由名字散列决定（`data-hue`），与设计稿的两种底色对应。
 */
export function Face(props: {
  name: string
  src?: string
  class?: string
  small?: boolean
  size?: number
}) {
  return (
    <span
      class={props.small === true ? "face face--sm" : (props.class ?? "face")}
      data-hue={hueOf(props.name)}
      style={props.size === undefined ? undefined : { width: `${props.size}px`, height: `${props.size}px`, "font-size": "13px" }}
      aria-hidden="true"
    >
      <Show when={props.src !== undefined && props.src.length > 0} fallback={initialsOf(props.name)}>
        <img src={props.src} alt="" />
      </Show>
    </span>
  )
}
