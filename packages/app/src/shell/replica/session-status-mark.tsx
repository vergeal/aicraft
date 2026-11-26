import { Show } from "solid-js"
import { ActivityRing } from "@aicraft/ui/activity-ring"
import { useLanguage } from "@/runtime/i18n/language"
import type { InboxStatus } from "@/shell/titlebar/inbox-model"

const DOT: Record<Exclude<InboxStatus, "ready" | "working">, string> = {
  approval: "bg-[var(--v2-state-fg-warning)]",
  input: "bg-[var(--v2-state-fg-warning)]",
  failed: "bg-[var(--v2-state-fg-danger)]",
  done: "bg-[var(--v2-state-fg-success)]",
}

const STATUS_LABEL = {
  approval: "sidebar.inbox.status.approval",
  input: "sidebar.inbox.status.input",
  working: "sidebar.inbox.status.working",
  failed: "sidebar.inbox.status.failed",
  done: "sidebar.inbox.status.done",
} as const

/** The run state at the end of a conversation row: a ring while working, one dot once the result lands. */
export function StatusMark(props: { status: InboxStatus }) {
  const language = useLanguage()

  const label = () => {
    const value = props.status

    if (value === "ready") return

    return STATUS_LABEL[value]
  }

  return (
    <Show when={label()}>
      {(key) => (
        <span class="ms-auto flex shrink-0 items-center" title={language.t(key())}>
          <Show
            when={props.status === "working"}
            fallback={
              <span
                aria-hidden="true"
                class={`size-[6px] shrink-0 rounded-full ${DOT[props.status as Exclude<InboxStatus, "ready" | "working">]}`}
              />
            }
          >
            <ActivityRing class="size-3.5 shrink-0 text-[var(--color-icon-secondary)]" />
          </Show>
          <span class="sr-only">{language.t(key())}</span>
        </span>
      )}
    </Show>
  )
}
