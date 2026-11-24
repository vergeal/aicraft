import type { LocalProject } from "@/shell/state/layout"
import { ProjectFolder } from "@aicraft/ui/project-folder"

// The project mark never changes while a session works: callers show `ActivityRing` at the row's trailing edge, as
// session tabs do.
export function SessionTabAvatarView(props: { project?: LocalProject; directory: string; unread: boolean }) {
  return <ProjectFolder unread={props.unread} />
}
