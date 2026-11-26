import { createMemo } from "solid-js"
import { SettingsPage } from "@aicraft/aix/gui"
import { isRootTab } from "@/settings/route"
import { usePluginHost } from "./host"

/** The settings pages plugins contribute. */
export function createSettingsPages() {
  const host = usePluginHost()
  const items = createMemo(() => host.items(SettingsPage))

  // Host tabs win over a plugin page with the same id (see `isPluginTab` in settings/route), so a colliding
  // page is unreachable: it must not list a second navigation row or mount a second panel over the host's.
  const pages = createMemo(() => items().filter((item) => !item.value.page && !isRootTab(item.value.id)))
  const tabs = createMemo<ReadonlySet<string>>(() => new Set(pages().map((item) => item.value.id)))

  return {
    items,
    /** Settings pages without a host page, in contribution order. */
    pages,
    /** Their tab values. */
    tabs,
    /** Sections on a host page, or with `section`, the rows placed in that host section. */
    sections: (page: "general" | "servers", section?: "general") =>
      items().filter((item) => item.value.page === page && item.value.section === section),
  }
}
