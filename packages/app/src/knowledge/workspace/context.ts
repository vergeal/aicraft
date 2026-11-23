import { createSimpleContext } from "@opencode/ui/context"
import { createMemo } from "solid-js"
import { useKnowledge } from "../context"
import { createWorkspaceData } from "./data"
import { createWorkspaceState } from "./state"

/**
 * One workspace for the knowledge destination: the sidebar, every view and the overlays read the same
 * navigation state and the same knowledge store the rest of the app uses.
 */
export const { use: useWorkspace, provider: WorkspaceProvider } = createSimpleContext({
  name: "Workspace",
  gate: false,
  init: () => {
    const knowledge = useKnowledge()
    const ui = createWorkspaceState()
    const data = createWorkspaceData(knowledge)

    /** Every visible document across libraries, which the collections and the home page read. */
    const documents = createMemo(() =>
      knowledge.libraries.libraries().flatMap((library) =>
        library.files.filter((file) => !file.deletedAt).map((file) => ({ library, file })),
      ),
    )

    const openDocument = (libraryID: string, path: string) => {
      const library = knowledge.libraries.get(libraryID)
      const file = library?.files.find((entry) => entry.path === path)

      if (!library || !file) return
      knowledge.libraries.markFileOpened(libraryID, path)
      knowledge.libraries.markOpened(libraryID)
      void knowledge.openFile(library, file)
      ui.openDoc(libraryID, path)
    }

    const openLibrary = (libraryID: string) => {
      const library = knowledge.libraries.get(libraryID)

      if (!library) return
      knowledge.libraries.markOpened(libraryID)
      knowledge.openLibrary(library)
      ui.openLibrary(libraryID)
    }

    return { knowledge, ui, data, documents, openDocument, openLibrary }
  },
})
