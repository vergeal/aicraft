import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { Icon } from "@aicraft/ui/icon"
import { IconButton } from "@aicraft/ui/icon-button"
import { Menu } from "@aicraft/ui/menu"
import { Tooltip } from "@aicraft/ui/tooltip"
import { useI18n } from "@aicraft/ui/context/i18n"
import type { SessionUserActions } from "../actions"
import { writeClipboard } from "../components/markdown-clipboard"
import {
  createMessageActionState,
  transitionMessageAction,
  viewMessageActions,
  type MessageAction,
  type MessageActionCapabilities,
  type MessageActionEvent,
} from "./action-machine"

/**
 * The user message's action row. Rewind, then the sent time sit on one always-visible line under the bubble,
 * so hovering never adds or removes a line. Fork moved to the reply's footer; copy stays in the leading menu,
 * which never changes the row's width.
 */
export function UserMessageActions(props: {
  /** Omitted while the host has no session yet: its actions stay disabled instead of leaving the row. */
  sessionID?: string
  messageID: string
  createdAt: number
  /** The server has not delivered this message yet, so a pending steer queues or deletes instead. */
  pending?: boolean
  actions?: SessionUserActions
  /** The visible text the copy action writes. */
  text?: string
  /** A voice message also offers the full prompt the session received. */
  fullText?: string
  /** Omitted, this row offers fork too; the session timeline moves fork to the reply's footer instead. */
  fork?: boolean
}) {
  const i18n = useI18n()
  const [state, setState] = createSignal(createMessageActionState())

  const capabilities = createMemo<MessageActionCapabilities>(() => ({
    pending: !!props.pending,
    canPending: !!props.actions?.pending && !!props.sessionID,
    canRevert: !!props.actions?.revert && !!props.sessionID,
    canFork: !!props.actions?.fork && !!props.sessionID,
  }))

  const actionView = createMemo(() => viewMessageActions(state(), capabilities()))

  const runAction = (kind: MessageAction) => {
    if (!props.sessionID) return

    const input = { sessionID: props.sessionID, messageID: props.messageID }

    if (kind === "queue") return props.actions?.pending?.queue(input)

    if (kind === "remove") return props.actions?.pending?.remove(input)

    if (kind === "revert") return props.actions?.revert?.(input)

    return props.actions?.fork?.(input)
  }

  const dispatch = (event: MessageActionEvent) => {
    const next = transitionMessageAction(state(), event)
    setState(next.state)
    next.effects.forEach((effect) => {
      // The executor turns a synchronous throw into a rejection, so every outcome settles the attempt.
      void new Promise<void>((resolve) => resolve(runAction(effect.action))).then(
        () => dispatch({ type: "succeeded", attempt: effect.attempt }),
        () => dispatch({ type: "failed", attempt: effect.attempt }),
      )
    })
  }

  const request = (kind: MessageAction) => dispatch({ type: "requested", action: kind, capabilities: capabilities() })

  onCleanup(() => dispatch({ type: "disposed" }))

  const sent = createMemo(() =>
    new Intl.DateTimeFormat(i18n.locale(), { dateStyle: "medium", timeStyle: "short" }).format(props.createdAt),
  )

  return (
    <span data-slot="user-message-actions" class="inline-flex items-center gap-[6px]">
      <Show when={props.actions}>
        <Menu gutter={4} placement="bottom-end">
          <Tooltip appearance="compact" value={i18n.t("ui.message.moreActions")} placement="top" gutter={4}>
            <Menu.Trigger
              as={IconButton}
              icon={<Icon name="outline-dots" size="small" />}
              size="small"
              variant="ghost-muted"
              onMouseDown={(event: MouseEvent) => event.preventDefault()}
              onClick={(event: MouseEvent) => event.stopPropagation()}
              aria-label={i18n.t("ui.message.moreActions")}
            />
          </Tooltip>
          <Menu.Portal>
            <Menu.Content>
              <Menu.Item disabled={!props.text} onSelect={() => void writeClipboard(props.text ?? "")}>
                {i18n.t("ui.message.copyMessage")}
              </Menu.Item>
              {/* Like the iOS app, a Voice message also offers the full prompt the session received. */}
              <Show when={props.fullText}>
                {(fullText) => (
                  <Menu.Item onSelect={() => void writeClipboard(fullText())}>
                    {i18n.t("ui.message.copyFullMessage")}
                  </Menu.Item>
                )}
              </Show>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
        <Show when={props.pending}>
          <ActionButton
            icon="arrow-down-to-line"
            label={i18n.t("ui.message.moveToQueue")}
            disabled={actionView().disabled.queue}
            onRequest={() => request("queue")}
          />
          <ActionButton
            icon="outline-trash"
            label={i18n.t("ui.message.deletePending")}
            disabled={actionView().disabled.remove}
            onRequest={() => request("remove")}
          />
        </Show>
        <Show when={!props.pending}>
          <ActionButton
            icon="reset"
            label={i18n.t("ui.message.revertMessage")}
            disabled={actionView().disabled.revert}
            onRequest={() => request("revert")}
          />
          <Show when={props.fork !== false}>
            <ActionButton
              icon="fork"
              label={i18n.t("ui.message.forkMessage")}
              disabled={actionView().disabled.fork}
              onRequest={() => request("fork")}
            />
          </Show>
        </Show>
      </Show>
      {/* The sent time is the reader's, not the host's: it stays whether or not this message offers actions. */}
      <time
        data-slot="user-message-time"
        dateTime={new Date(props.createdAt).toISOString()}
        class="shrink-0 whitespace-nowrap tabular-nums text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-faint"
      >
        {sent()}
      </time>
    </span>
  )
}

function ActionButton(props: {
  icon: "reset" | "fork" | "arrow-down-to-line" | "outline-trash"
  label: string
  disabled: boolean
  onRequest: () => void
}) {
  return (
    <Tooltip appearance="compact" value={props.label} placement="top" gutter={4}>
      <IconButton
        icon={<Icon name={props.icon} size="small" />}
        size="small"
        variant="ghost-muted"
        disabled={props.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation()
          props.onRequest()
        }}
        aria-label={props.label}
      />
    </Tooltip>
  )
}
