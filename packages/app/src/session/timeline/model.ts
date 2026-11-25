import { createMemo, createResource } from "solid-js"
import { useData } from "@/runtime/server/current"
import { getSessionMessageHandoff } from "@/session/handoff"
import type { SessionModel } from "../model"

export function createTimelineModel(input: { session: Pick<SessionModel, "identity" | "history" | "ownership"> }) {
  const data = useData()

  const [resource] = createResource(
    () => input.session.identity.sessionID(),
    async (id) => {
      if (!id) return
      await Promise.all([data.session.message.sync(id), data.session.pending.sync(id)])

      return id
    },
  )

  const ready = createMemo(() => {
    const id = input.session.identity.sessionID()

    if (!id || (!resource.loading && resource.latest === id)) return true

    // Show the already loaded tail before the resource settles. Opening loads one page; older history arrives
    // when the reader scrolls up, not eagerly. Undelivered inbox rows load with the inbox, not the transcript,
    // so alone they are no tail; a first prompt shows through its handoff.
    return (
      data.session.message.list(id).some((message) => !data.session.input.has(id, message.id)) ||
      !!getSessionMessageHandoff(input.session.identity.sessionKey())
    )
  })

  const more = () => {
    const id = input.session.identity.sessionID()

    return id ? data.session.message.more(id) : false
  }

  return {
    history: {
      loadMore: (id: string, signal: AbortSignal) => data.session.message.loadMore(id, { signal }),
      more,
    },
    lastUserMessage: input.session.history.lastUserMessage,
    messages: input.session.history.messages,
    ready,
    resource,
    visibleUserMessages: input.session.history.visibleUserMessages,
  }
}
