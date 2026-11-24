import { Menu } from "@aicraft/ui/menu"
import type { Component } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"

/** Copies text to the clipboard and reports the result, naming what failed in the error toast. */
export function useCopyText(failed: { title: string; description: string }) {
  const language = useLanguage()
  const platform = usePlatform()

  return async (text: string) => {
    try {
      await (platform.writeClipboardText?.(text) ?? navigator.clipboard.writeText(text))
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("common.copied"),
        description: text,
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: failed.title,
        description: error instanceof Error ? error.message : failed.description,
      })
    }
  }
}

/** Copies a session ID from a row, tab or inbox menu, the same way the `session.copyID` command does. */
export function useCopySessionID() {
  const language = useLanguage()

  return useCopyText({
    title: language.t("toast.session.copyID.failed.title"),
    description: language.t("toast.session.copyID.failed.description"),
  })
}

export const SessionMenuCopyID: Component<{ sessionID: string | undefined }> = (props) => {
  const language = useLanguage()
  const copy = useCopySessionID()

  return (
    <Menu.Item disabled={!props.sessionID} onSelect={() => props.sessionID && void copy(props.sessionID)}>
      {language.t("command.session.copyID")}
    </Menu.Item>
  )
}
