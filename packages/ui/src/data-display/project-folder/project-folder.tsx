import { Show, splitProps, type ComponentProps } from "solid-js"
import { Icon } from "../../icons/icon/icon"
import "./project-folder.css"

export interface ProjectFolderProps extends ComponentProps<"div"> {
  unread?: boolean
}

/**
 * The mark for a project: one folder glyph, identical for every project. Projects carry no avatar of their own, so a
 * row is identified by its name and path instead of by a generated or uploaded image.
 */
export function ProjectFolder(props: ProjectFolderProps) {
  const [split, rest] = splitProps(props, ["unread", "class", "classList", "style"])

  return (
    <div
      {...rest}
      data-component="project-folder"
      data-unread={split.unread ? "" : undefined}
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
      style={split.style}
    >
      <Icon name="folder" />
      <Show when={split.unread}>
        <span data-slot="project-folder-unread-dot" aria-hidden="true" />
      </Show>
    </div>
  )
}
