import type { Context } from "@aicraft/plugin/gui"
import { Show, createSignal, onCleanup, onMount } from "solid-js"
import { Face } from "./avatar.js"
import { text } from "./i18n.js"

/** 一个人（或一个群）在卡片里能确认的身份，全部来自本地库。 */
export interface Person {
  /** 账号；群聊时是群号。 */
  account: string
  name: string
  head?: string
  online: boolean
  department?: string
  /** 群聊：卡片标「群聊」，主按钮是「打开群聊」。 */
  group?: boolean
  /** 已有会话 id。没有就说明本地还没和 TA 聊过，卡片不给死按钮。 */
  sessionId?: string
}

/**
 * 用户卡片的状态：显示谁、挂在哪个元素旁。
 *
 * 卡片长在头像旁边，位置在渲染后夹进视口；关闭时焦点回到那个头像。
 */
export function createProfile() {
  const [opened, setOpened] = createSignal<{ person: Person; anchor: DOMRect }>()
  let restore: HTMLElement | undefined

  const open = (element: HTMLElement, person: Person) => {
    restore = element
    setOpened({ person, anchor: element.getBoundingClientRect() })
  }

  const close = () => {
    if (opened() === undefined) return
    setOpened(undefined)
    restore?.focus({ preventScroll: true })
    restore = undefined
  }

  return { opened, open, close }
}

export type Profile = ReturnType<typeof createProfile>

/** 卡片本体：身份、账号、部门（群聊标「群聊」），以及「发消息 / 复制账号」。 */
export function ProfileCard(props: {
  ctx: Context
  profile: Profile
  onOpenSession: (sessionId: string) => void
  onCopy: (value: string) => void
}) {
  let element: HTMLDivElement | undefined

  const copyAccount = (person: Person) => {
    props.profile.close()
    props.onCopy(person.account)
  }

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (element !== undefined && event.target instanceof Node && element.contains(event.target)) return
      props.profile.close()
    }
    const onBlur = () => props.profile.close()
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("blur", onBlur)
    onCleanup(() => {
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("blur", onBlur)
    })
  })

  return (
    <Show when={props.profile.opened()} keyed>
      {(opened) => (
        <div
          class="profile"
          role="dialog"
          aria-label={opened.person.name}
          tabIndex={-1}
          style={{ left: "0px", top: "0px", visibility: "hidden" }}
          ref={(node) => {
            element = node
            queueMicrotask(() => {
              place(node, opened.anchor)
              node.style.visibility = ""
              node.querySelector<HTMLElement>("button")?.focus({ preventScroll: true })
            })
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              props.profile.close()
              return
            }
            if (event.key !== "Tab" || element === undefined) return
            // Tab 在卡片里循环，出去就等于把焦点丢进页面深处的消息流。
            const buttons = [...element.querySelectorAll<HTMLElement>("button")]
            const first = buttons[0]
            const last = buttons[buttons.length - 1]
            if (first === undefined || last === undefined) return
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }}
        >
          <div class="profile-who">
            <Face class="face profile-face" name={opened.person.name} src={opened.person.head} />
            <div class="profile-id">
              <div class="profile-name">
                {opened.person.name}
                <span class="profile-state" data-online={opened.person.online ? "true" : undefined}>
                  {opened.person.online ? text(props.ctx, "hyt.chat.user.online") : text(props.ctx, "hyt.chat.user.offline")}
                </span>
              </div>
              <div class="profile-account">{opened.person.account}</div>
              <div class="profile-dept">
                {opened.person.group === true
                  ? text(props.ctx, "hyt.chat.profile.group")
                  : (opened.person.department ?? "")}
              </div>
            </div>
          </div>

          <div class="profile-actions">
            <Show
              when={opened.person.sessionId}
              fallback={
                <button class="profile-primary" type="button" onClick={() => copyAccount(opened.person)}>
                  {text(props.ctx, "hyt.chat.profile.copy")}
                </button>
              }
            >
              {(sessionId) => (
                <>
                  <button
                    class="profile-primary"
                    type="button"
                    onClick={() => {
                      props.profile.close()
                      props.onOpenSession(sessionId())
                    }}
                  >
                    {opened.person.group === true
                      ? text(props.ctx, "hyt.chat.profile.openGroup")
                      : text(props.ctx, "hyt.chat.profile.message")}
                  </button>
                  <button class="profile-ghost" type="button" onClick={() => copyAccount(opened.person)}>
                    {text(props.ctx, "hyt.chat.profile.copy")}
                  </button>
                </>
              )}
            </Show>
          </div>

          <Show when={opened.person.sessionId === undefined}>
            <p class="profile-note">{text(props.ctx, "hyt.chat.profile.noSession")}</p>
          </Show>
        </div>
      )}
    </Show>
  )
}

/** 卡片贴着头像右侧，越界时翻到左边或贴边，保持整张可见。 */
function place(node: HTMLElement, anchor: DOMRect) {
  const rect = node.getBoundingClientRect()
  const right = anchor.right + 8
  const left = right + rect.width > window.innerWidth - 8 ? anchor.left - rect.width - 8 : right
  node.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`
  node.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - rect.height - 8))}px`
}
