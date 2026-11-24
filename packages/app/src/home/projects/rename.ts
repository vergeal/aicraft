import { Project } from "@aicraft/schema/project"
import { getFilename } from "@aicraft/util/path"
import { useLanguage } from "@/runtime/i18n/language"
import type { ServerCtx } from "@/runtime/server/runtime"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import type { LocalProject } from "@/shell/state/layout"

/**
 * Writes a project's display name.
 *
 * A project the server knows carries the name on its own record, so the rename is a request and the answer lands in
 * the shared project list. The built-in global project has no record to patch, so its name is kept locally against the
 * directory instead. Either way the caller only learns whether it stuck: a name that matches the folder is stored as
 * no override at all, which is how a rename back to the directory name clears the label.
 */
export function useRenameProject() {
  const language = useLanguage()

  return function rename(ctx: ServerCtx, project: LocalProject, label: string) {
    const name = label === getFilename(project.worktree) ? "" : label

    const write =
      project.id && project.id !== Project.ID.global
        ? ctx.sdk.api.project.update({ projectID: project.id, name }).then((next) => ctx.sync.project.update(next))
        : Promise.resolve(ctx.sync.project.meta(project.worktree, { name }))

    return write
      .then(() => true)
      .catch((cause: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        })

        return false
      })
  }
}
