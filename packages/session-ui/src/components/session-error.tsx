import { createMemo, Show } from "solid-js"
import { Card } from "@aicraft/ui/card"
import { Icon } from "@aicraft/ui/icon"
import { LinkedText } from "./linked-text"

// Only a colon before the first URL ends a title, so a scheme or port never splits a URL.
function splitErrorMessage(message: string) {
  const url = message.search(/https?:\/\//)
  const separator = message.slice(0, url === -1 ? undefined : url).indexOf(":")

  if (separator === -1) return { title: "", detail: message }

  return {
    title: message.slice(0, separator + 1),
    detail: message.slice(separator + 1),
  }
}

export function SessionErrorMessage(props: { message: string; links?: boolean }) {
  const content = createMemo(() => splitErrorMessage(props.message))

  return (
    <>
      <Show when={content().title}>{(title) => <strong class="font-[530]">{title()}</strong>}</Show>
      <Show when={props.links} fallback={content().detail}>
        <LinkedText text={content().detail} />
      </Show>
    </>
  )
}

export function SessionError(props: { message: string }) {
  const content = createMemo(() => splitErrorMessage(props.message))

  return (
    <Card variant="error" class="error-card" data-kind="session-error-card" role="alert">
      <Show
        when={content().title}
        fallback={
          <div class="flex w-full min-w-0 items-start gap-2">
            <Icon name="circle-exclamation-solid" class="shrink-0 text-v2-state-fg-danger" />
            <div class="min-w-0">
              <LinkedText text={content().detail} />
            </div>
          </div>
        }
      >
        {(title) => (
          <>
            <div class="flex w-full min-w-0 items-center gap-2">
              <Icon name="circle-exclamation-solid" class="shrink-0 text-v2-state-fg-danger" />
              <strong data-slot="session-error-title">{title()}</strong>
            </div>
            <div data-slot="session-error-detail">
              <LinkedText text={content().detail} />
            </div>
          </>
        )}
      </Show>
    </Card>
  )
}
