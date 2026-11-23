import { splitProps, type ComponentProps, type JSX } from "solid-js"
import { syncSpinPhase } from "../../hooks/spin-phase"
import "./glow-orb.css"

/**
 * Four blurred copies under a solid core turn a rotating gradient into a glowing orb. Geometry and blur radius scale
 * from one size variable, so the same shape reads at 12px and at 96px.
 * `width` and `height` size it like an SVG's attributes, below any CSS size.
 */
export function GlowOrb(
  props: Omit<ComponentProps<"span">, "style"> & {
    "data-component"?: string
    width?: number
    height?: number
    style?: JSX.CSSProperties
  },
) {
  const [local, rest] = splitProps(props, ["class", "classList", "data-component", "width", "height", "style"])
  const size = local.width ?? local.height

  return (
    <span
      {...rest}
      ref={syncSpinPhase}
      data-component={local["data-component"] ?? "glow-orb"}
      data-slot="glow-orb"
      classList={{ ...local.classList, [local.class ?? ""]: !!local.class }}
      style={{
        ...local.style,
        "--glow-orb-size": size === undefined ? undefined : `${size}px`,
      }}
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
