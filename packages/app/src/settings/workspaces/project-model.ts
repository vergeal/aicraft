import { getFilename } from "@opencode/util/path"
import type { ProjectUpdateInput } from "@opencode/client/promise"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useServer } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import type { LocalProject } from "@/shell/state/layout"
import { ServerConnection } from "@/runtime/server/registry"
import { showToast } from "@/shell/notifications/toast"

type ProjectPatch = Pick<ProjectUpdateInput, "name" | "commands" | "prompt">

export function createEditProjectModel(props: { project: LocalProject; server: ServerConnection.Any }) {
  const language = useLanguage()
  const serverCtx = useServer().ctx
  const folderName = createMemo(() => getFilename(props.project.worktree))
  const defaultName = createMemo(() => props.project.name || folderName())

  const [store, setStore] = createStore({
    name: defaultName(),
    startup: props.project.commands?.start ?? "",
    prompt: props.project.prompt ?? "",
    saving: 0,
  })

  const saved = {
    name: props.project.name ?? "",
    startup: store.startup.trim(),
    prompt: store.prompt.trim(),
  }

  let queue = Promise.resolve()

  const persist = (patch: ProjectPatch, complete: () => void) => {
    setStore("saving", (value) => value + 1)
    queue = queue
      .then(async () => {
        if (props.project.id && props.project.id !== "global") {
          const project = await serverCtx.sdk.api.project.update({ projectID: props.project.id, ...patch })
          serverCtx.sync.project.update(project)

          return
        }

        serverCtx.sync.project.meta(props.project.worktree, patch)
      })
      .then(complete)
      .catch((cause: unknown) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: cause instanceof Error ? cause.message : language.t("common.requestFailed"),
        })
      })
      .finally(() => setStore("saving", (value) => value - 1))
  }

  const saveName = () => {
    const value = store.name.trim() === folderName() ? "" : store.name.trim()

    // A pending write can change the saved value, so reverting to it must still be queued.
    if (!store.saving && value === saved.name) return
    persist({ name: value }, () => {
      saved.name = value
    })
  }

  const saveStartup = () => {
    const value = store.startup.trim()

    if (!store.saving && value === saved.startup) return
    persist({ commands: { start: value } }, () => {
      saved.startup = value
    })
  }

  const savePrompt = () => {
    // A Project without a root commit shares the `global` ID with every other such directory, so its
    // instructions cannot be told apart on the server. The settings page does not offer the field there.
    if (props.project.id === "global") return

    const value = store.prompt.trim()

    if (!store.saving && value === saved.prompt) return

    persist({ prompt: value }, () => {
      saved.prompt = value
    })
  }

  return {
    store,
    setStore,
    folderName,
    defaultName,
    saveName,
    saveStartup,
    savePrompt,
  }
}
