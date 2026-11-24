import type { Context } from "@aicraft/plugin/gui"
import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { text } from "./i18n.js"

/** 菜单条目：一条动作，或一条分线。 */
export type MenuEntry = { label: string; onSelect: () => void } | { separator: true }

/** 打开菜单的锚点：指针事件给落点，键盘触发时给被聚焦的元素。 */
export type MenuTarget = MouseEvent | HTMLElement

type Opened = { x: number; y: number; entries: readonly MenuEntry[] }

/**
 * 右键菜单的状态：谁打开、在哪、有哪些条目。
 *
 * 宿主的 `Ui.Menu` 只从触发器展开，插件页需要跟随指针，所以在窗口层自己画一个：
 * `position: fixed` 先按指针落位，渲染出来量到尺寸后夹进视口（靠边就翻到另一侧）。
 * 关闭时把焦点还给打开它的元素，键盘用户不会掉到 body 上。
 */
export function createMenu() {
  const [opened, setOpened] = createSignal<Opened>()
  const [active, setActive] = createSignal(0)
  let restore: HTMLElement | undefined

  const open = (target: MenuTarget, entries: readonly MenuEntry[]) => {
    if (entries.length === 0) return
    if (target instanceof MouseEvent) {
      target.preventDefault()
      target.stopPropagation()
    }
    restore = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    setActive(0)
    setOpened({ ...anchorOf(target), entries })
  }

  const close = () => {
    if (opened() === undefined) return
    setOpened(undefined)
    restore?.focus({ preventScroll: true })
    restore = undefined
  }

  return { opened, open, close, active, setActive }
}

export type Menu = ReturnType<typeof createMenu>

/** 动作条目：去掉分线后的那一半。 */
type MenuAction = { label: string; onSelect: () => void }

/** 把条目列表转成渲染行，顺便给动作编号，键盘上下移动只数动作、跳过线。 */
function rowsOf(entries: readonly MenuEntry[]) {
  let index = -1
  return entries.map((entry) =>
    "separator" in entry ? { kind: "rule" as const } : { kind: "item" as const, entry, index: (index += 1) },
  )
}

/** 菜单本体：键盘、外部点击、窗口变化都只做一件事——关掉它。 */
export function MenuLayer(props: { ctx: Context; menu: Menu }) {
  let element: HTMLDivElement | undefined

  const actions = (entries: readonly MenuEntry[]) =>
    entries.filter((entry): entry is MenuAction => !("separator" in entry))

  const move = (entries: readonly MenuEntry[], step: number) => {
    const count = actions(entries).length
    if (count === 0) return
    props.menu.setActive((props.menu.active() + step + count) % count)
  }

  const run = (entries: readonly MenuEntry[], index: number) => {
    const entry = actions(entries)[index]
    if (entry === undefined) return
    props.menu.close()
    entry.onSelect()
  }

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (element !== undefined && event.target instanceof Node && element.contains(event.target)) return
      props.menu.close()
    }
    const close = () => props.menu.close()
    document.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("blur", close)
    window.addEventListener("resize", close)
    document.addEventListener("scroll", close, true)
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("blur", close)
      window.removeEventListener("resize", close)
      document.removeEventListener("scroll", close, true)
    })
  })

  return (
    <Show when={props.menu.opened()} keyed>
      {(opened) => {
        const rows = rowsOf(opened.entries)
        return (
          <div
            class="menu"
            role="menu"
            aria-label={text(props.ctx, "hyt.chat.menu.label")}
            tabIndex={-1}
            style={{ left: `${opened.x}px`, top: `${opened.y}px`, visibility: "hidden" }}
            ref={(node) => {
              element = node
              queueMicrotask(() => {
                place(node, opened)
                node.style.visibility = ""
                node.focus({ preventScroll: true })
              })
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                props.menu.close()
                return
              }
              if (event.key === "Tab") {
                event.preventDefault()
                props.menu.close()
                return
              }
              if (event.key === "ArrowDown") {
                event.preventDefault()
                move(opened.entries, 1)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                move(opened.entries, -1)
                return
              }
              if (event.key === "Enter") {
                event.preventDefault()
                run(opened.entries, props.menu.active())
              }
            }}
          >
            <For each={rows}>
              {(row) =>
                row.kind === "rule" ? (
                  <div class="menu-rule" role="separator" />
                ) : (
                  <button
                    class="menu-item"
                    type="button"
                    role="menuitem"
                    data-active={props.menu.active() === row.index ? "true" : undefined}
                    onPointerEnter={() => props.menu.setActive(row.index)}
                    onClick={() => run(opened.entries, row.index)}
                  >
                    {row.entry.label}
                  </button>
                )
              }
            </For>
          </div>
        )
      }}
    </Show>
  )
}

/** 指针落点，或键盘打开时贴着元素的左下角。 */
function anchorOf(target: MenuTarget) {
  if (target instanceof MouseEvent) return { x: target.clientX, y: target.clientY }
  const rect = target.getBoundingClientRect()
  return { x: rect.left, y: rect.bottom + 2 }
}

/** 指针落点 → 视口内的位置：右侧/下方不够就贴近边缘，不裁切。 */
function place(node: HTMLElement, opened: Opened) {
  const rect = node.getBoundingClientRect()
  node.style.left = `${Math.max(8, Math.min(opened.x, window.innerWidth - rect.width - 8))}px`
  node.style.top = `${Math.max(8, Math.min(opened.y, window.innerHeight - rect.height - 8))}px`
}
