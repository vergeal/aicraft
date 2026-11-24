import { createUniqueId } from "solid-js"
import "./brand-mark.css"

/**
 * The product mark for identity surfaces: the gradient ring with its light core, drawn on the 24 grid from
 * `assets/brand/logo-mark-color.svg`. Brand colours are fixed rather than theme tokens (design/logo README), so the
 * only dark-mode change is the brighter core via `data-color-scheme`.
 */
export function BrandMark(props: { class?: string; label?: string }) {
  const gradient = createUniqueId()

  return (
    <svg
      data-component="brand-mark"
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={props.label ?? "AI Craft"}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop class="brand-mark-grad-start" offset="0" />
          <stop class="brand-mark-grad-mid" offset="0.55" />
          <stop class="brand-mark-grad-end" offset="1" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke={`url(#${gradient})`} stroke-width="2" />
      <rect class="brand-mark-counter" x="8.5" y="8.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}
