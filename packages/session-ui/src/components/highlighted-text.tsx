import { For, Show, createEffect, createMemo, onCleanup } from "solid-js"
import type { PromptAgentAttachment, PromptAttachment, PromptSkillAttachment } from "@opencode/client/promise"
import { linkSegments } from "./link-segments"
import { sessionReferenceText, setupSessionLinks } from "./markdown-session-links"
import { useMarkdown } from "../context/markdown"

/**
 * Plain prompt text with the mentions it carries marked up: a file, agent or skill keeps its accent color at the
 * offset the server recorded, and a session mention reads as its title instead of `@session:<id>`.
 */
export function HighlightedText(props: {
  text: string
  files: readonly PromptAttachment[]
  agents: readonly PromptAgentAttachment[]
  skills: readonly PromptSkillAttachment[]
}) {
  const segments = createMemo(() => {
    const references = [
      ...props.files.flatMap((file) =>
        file.mention ? [{ start: file.mention.start, end: file.mention.end, type: "file" as const }] : [],
      ),
      ...props.agents.flatMap((agent) =>
        agent.mention ? [{ start: agent.mention.start, end: agent.mention.end, type: "agent" as const }] : [],
      ),
      ...props.skills.flatMap((skill) =>
        skill.mention ? [{ start: skill.mention.start, end: skill.mention.end, type: "skill" as const }] : [],
      ),
    ].sort((a, b) => a.start - b.start)

    const result: HighlightSegment[] = []

    // Plain text between references may contain URLs, which become links.
    const pushText = (text: string) =>
      result.push(
        ...linkSegments(text).map(
          (segment): HighlightSegment => ({
            text: segment.text,
            type: segment.href ? "link" : undefined,
          }),
        ),
      )

    let last = 0
    references.forEach((reference) => {
      if (reference.start < last) return

      if (reference.start > last) pushText(props.text.slice(last, reference.start))
      result.push({ text: props.text.slice(reference.start, reference.end), type: reference.type })
      last = reference.end
    })

    if (last < props.text.length) pushText(props.text.slice(last))

    return result
  })

  return (
    <For each={segments()}>
      {(segment) => (
        <Show
          when={segment.type === "link"}
          fallback={
            <span data-highlight={segment.type}>
              <Show
                when={segment.type && segment.text.startsWith("@")}
                fallback={<SessionReferenceText text={segment.text} />}
              >
                <span data-slot="user-message-mention-prefix">@</span>
                {segment.text.slice(1)}
              </Show>
            </span>
          }
        >
          <a data-slot="user-message-link" href={segment.text} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        </Show>
      )}
    </For>
  )
}

type HighlightSegment = { text: string; type?: "file" | "agent" | "skill" | "link" }

function SessionReferenceText(props: { text: string }) {
  const markdown = useMarkdown()
  const root = document.createElement("span")
  createEffect(() => root.replaceChildren(sessionReferenceText(props.text, (id) => markdown?.sessionTitle?.(id))))
  onCleanup(setupSessionLinks(root, () => markdown?.openSession))

  return root
}
