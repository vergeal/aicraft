import { createUniqueId, onMount, type Component, type JSX } from "solid-js"
import "@/settings/settings.css"

export interface SettingsRowProps {
  title: string | JSX.Element
  description: string | JSX.Element
  children: JSX.Element
  align?: "start"
}

export const SettingsRow: Component<SettingsRowProps> = (props) => {
  const titleID = createUniqueId()
  let row: HTMLDivElement | undefined

  // Switch renders a <Label> only when it is given children, and a settings toggle is labelled by its row instead of
  // by the primitive. Point the control's hidden input at the row title so a screen reader announces the setting.
  onMount(() => {
    row
      ?.querySelectorAll<HTMLInputElement>('[data-slot="settings-row-control"] [data-slot="switch-input"]')
      .forEach((input) => input.setAttribute("aria-labelledby", titleID))
  })

  return (
    <div ref={row} data-component="settings-row" data-align={props.align}>
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title" id={titleID}>
          {props.title}
        </div>
        <div data-slot="settings-row-description">{props.description}</div>
      </div>
      <div data-slot="settings-row-control">{props.children}</div>
    </div>
  )
}
