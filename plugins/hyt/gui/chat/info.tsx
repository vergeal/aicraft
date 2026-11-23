import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo } from "solid-js"
import type { MemberRow, MessageRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { Face } from "./avatar.js"
import { clockOf, sizeOf } from "./util.js"

/**
 * 右侧资料：会话对象、群成员、最近共享的文件。
 *
 * 只显示本机读得到的东西。部门来自通讯录，找不到就留空；不在本地库里的
 * 群设置一律指向客户端，不做假按钮。
 */
export function InfoPanel(props: {
  ctx: Context
  session: SessionRow | undefined
  directory: readonly MemberRow[]
  messages: readonly MessageRow[]
  avatars: Record<string, string>
  open: boolean
  onClose: () => void
  onOpenFile: (path: string) => void
}) {
  const members = () => props.session?.members ?? []

  const roleOf = (name: string) => {
    const hit = props.directory.find((member) => member.name === name)
    return hit?.department ?? ""
  }

  const files = createMemo(() => {
    const seen = new Set<string>()
    const out: MessageRow[] = []
    for (const message of props.messages) {
      if (message.kind !== "file" && message.kind !== "image") continue
      const name = message.fileName.length > 0 ? message.fileName : message.text
      if (name.length === 0 || seen.has(name)) continue
      seen.add(name)
      out.push(message)
      if (out.length >= 5) break
    }
    return out
  })

  const meta = () => {
    const session = props.session
    if (session === undefined) return ""
    const kind = session.group ? text(props.ctx, "hyt.chat.sessions.group") : text(props.ctx, "hyt.chat.sessions.direct")
    return `${kind} · ${text(props.ctx, "hyt.chat.rail.foot")}`
  }

  return (
    <aside class="panel" role="dialog" aria-labelledby="hyt-chat-panel-title" hidden={!props.open}>
      <div class="panel-head" id="hyt-chat-panel-title">
        {text(props.ctx, "hyt.chat.panel.title")}
        <button class="icon-btn" type="button" aria-label={text(props.ctx, "hyt.chat.panel.close")} onClick={() => props.onClose()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </div>

      <div class="panel-body">
        <Show when={props.session !== undefined}>
          <div class="subject">
            <Face
              name={members()[0]?.name ?? props.session!.name}
              src={avatarOf(props.avatars, members()[0]?.headPath)}
              size={44}
              class="face"
            />
            <div>
              <h3 class="subject-name">{props.session!.name}</h3>
              <div class="subject-meta">{meta()}</div>
            </div>
          </div>

          <Show when={members().length > 0}>
            <div class="section">
              {text(props.ctx, "hyt.chat.panel.members")}
              <span>{text(props.ctx, "hyt.chat.members.count", { count: members().length })}</span>
            </div>
            <For each={members()}>
              {(member) => (
                <div class="person">
                  <Face small name={member.name} src={avatarOf(props.avatars, member.headPath)} />
                  <div>
                    <div class="person-name">
                      {member.name}
                      <Show when={!props.session!.group && props.session!.online}>
                        <span class="dot" aria-hidden="true" />
                        <span class="sr-only">{text(props.ctx, "hyt.chat.user.online")}</span>
                      </Show>
                    </div>
                    <Show when={roleOf(member.name).length > 0}>
                      <div class="person-role">{roleOf(member.name)}</div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>

          <div class="section">
            {text(props.ctx, "hyt.chat.panel.files")}
            <span>{text(props.ctx, "hyt.chat.panel.file.count", { count: files().length })}</span>
          </div>
          <Show
            when={files().length > 0}
            fallback={<p class="panel-note">{text(props.ctx, "hyt.chat.panel.files.empty")}</p>}
          >
            <For each={files()}>
              {(message) => (
                <button
                  class="person"
                  type="button"
                  style={{ width: "100%", border: "0", background: "none", "text-align": "start", cursor: "pointer" }}
                  onClick={() => props.onOpenFile(message.filePath)}
                >
                  <Face small name={message.fileName || message.text} />
                  <div>
                    <div class="person-name">{message.fileName || message.text}</div>
                    <div class="person-role">{fileMeta(props.ctx, message)}</div>
                  </div>
                </button>
              )}
            </For>
          </Show>

          <p class="panel-note">{text(props.ctx, "hyt.chat.panel.note")}</p>
        </Show>
      </div>
    </aside>
  )
}

function avatarOf(map: Record<string, string>, path: string | undefined) {
  if (path === undefined || path.length === 0) return undefined
  const value = map[path]
  return value === undefined || value.length === 0 ? undefined : value
}

function fileMeta(ctx: Context, message: MessageRow) {
  const sender = message.outgoing ? text(ctx, "hyt.chat.msg.self") : message.senderNick
  return [sender, clockOf(message.createdAt), sizeOf(message.fileSize)].filter((part) => part.length > 0).join(" · ")
}
