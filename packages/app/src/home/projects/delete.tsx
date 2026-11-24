import { useDialog } from "@aicraft/ui/context/dialog"
import { ConfirmDialog } from "@aicraft/ui/confirm-dialog"
import { displayName } from "@aicraft/ui/project-avatar"
import { Project } from "@aicraft/schema/project"
import { useQueryClient } from "@tanstack/solid-query"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { usePinnedSessions } from "@/session/pins"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import type { LocalProject } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { notifySessionTabsRemoved } from "@/shell/titlebar/session-events"

/**
 * Confirms and deletes a project together with every session in it. The directory stays on disk: resolving it again
 * recreates the project. Open session tabs of the project close here, and `project.deleted` drops it from the lists.
 */
export function useDeleteProject() {
  const dialog = useDialog()
  const language = useLanguage()
  const global = useGlobal()
  const tabs = useTabs()
  const pins = usePinnedSessions()
  const queryClient = useQueryClient()

  return (conn: ServerConnection.Any, project: LocalProject) => {
    const projectID = project.id
    const server = ServerConnection.key(conn)
    const ctx = global.serverCtx(server)

    // The global project collects directories that belong to no repository; deleting it would take their sessions too.
    if (!projectID || projectID === Project.ID.global || !ctx) return

    const confirm = async () => {
      try {
        await ctx.sdk.api.project.remove({ projectID })
        const sessionIDs = tabs.store.flatMap((tab) => {
          if (tab.type !== "session" || tab.server !== server) return []

          return ctx.data.session.get(tab.sessionId)?.projectID === projectID ? [tab.sessionId] : []
        })

        pins.remove(sessionIDs)
        notifySessionTabsRemoved({ server, directory: project.worktree, sessionIDs })
        void queryClient.invalidateQueries({ queryKey: ["home-sessions", conn], exact: true })
        void queryClient.invalidateQueries({
          queryKey: [ctx.sdk.scope, "settings-workspace-project-metadata"],
          exact: true,
        })
      } catch (cause) {
        showToast({
          title: language.t("project.delete.failed.title"),
          description: errorMessage(cause, language.t("project.delete.failed.title")),
        })
      }
    }

    void dialog.show(() => (
      <ConfirmDialog
        title={language.t("project.delete.title")}
        description={language.t("project.delete.confirm", { name: displayName(project) })}
        confirmLabel={language.t("project.delete.button")}
        cancelLabel={language.t("common.cancel")}
        tone="danger"
        onConfirm={() => void confirm()}
      />
    ))
  }
}
