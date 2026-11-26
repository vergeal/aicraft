import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@aicraft/ui/button"
import { Checkbox } from "@aicraft/ui/checkbox"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@aicraft/ui/dialog"
import { MenuScroll } from "@aicraft/ui/menu-scroll"
import { displayName } from "@aicraft/ui/project-avatar"
import { useLanguage } from "@/runtime/i18n/language"
import { sessionLabel } from "@/session/title"
import { inboxArchived, type InboxEntry } from "@/shell/titlebar/inbox-model"
import { StatusMark } from "./session-status-mark"
import "./bulk-archive-dialog.css"

/** One project folder in the picker: the sessions that sit under it, keyed the way the sidebar groups them. */
type BulkArchiveGroup = {
  key: string
  name: string
  entries: InboxEntry[]
}

/**
 * The bulk-archive picker: every unarchived session across the visible servers, grouped by project, with a checkbox
 * per row and a per-project toggle that reads as indeterminate when a folder is half picked. The confirm button
 * names the count, and the archiving itself is left to the caller's one-row archive path so the sidebar's optimistic
 * moves and tab cleanups stay in one place.
 */
export function BulkArchiveDialog(props: {
  entries: InboxEntry[]
  onConfirm: (selected: InboxEntry[]) => void
}) {
  const language = useLanguage()

  const dialog = useDialog()

  // The caller hands in a snapshot, so the picker's data is computed once at open: an activity tick or a live
  // archive never re-sorts the list or rebuilds the rows under the pointer.
  const candidates = props.entries.filter((entry) => !inboxArchived(entry))

  const groups: BulkArchiveGroup[] = []
  const byKey = new Map<string, BulkArchiveGroup>()

  for (const entry of candidates) {
    const project = entry.ctx.projects.forSession(entry.session)
    const directory = project?.worktree ?? entry.session.location.directory
    const key = `${entry.server}\0${project?.id ?? directory}`
    const existing = byKey.get(key)

    if (existing) {
      existing.entries.push(entry)

      continue
    }

    const name = project
      ? displayName(project)
      : directory.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || key

    const group = { key, name, entries: [entry] }

    byKey.set(key, group)
    groups.push(group)
  }

  const [picked, setPicked] = createStore<Record<string, boolean>>({})

  const setMany = (list: InboxEntry[], value: boolean) => list.forEach((entry) => setPicked(entry.key, value))

  const selected = createMemo(() => candidates.filter((entry) => picked[entry.key]))

  // One read of a folder's ticks drives its header checkbox.
  const tickState = (list: InboxEntry[]) => {
    const on = list.filter((entry) => picked[entry.key]).length

    return { checked: list.length > 0 && on === list.length, indeterminate: on > 0 && on < list.length }
  }

  const confirm = () => {
    const chosen = selected()

    if (chosen.length === 0) return
    dialog.close()
    props.onConfirm(chosen)
  }

  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("replica.bulkArchive.title")}
          description={language.t("replica.bulkArchive.description")}
        />
      </DialogHeader>
      <DialogBody flush>
        <Show
          when={candidates.length > 0}
          fallback={<p class="bulk-archive-empty">{language.t("replica.bulkArchive.empty")}</p>}
        >
          <MenuScroll class="bulk-archive-list">
            <For each={groups}>
              {(group) => (
                <div class="bulk-archive-group">
                  <Checkbox
                    appearance="compact"
                    class="bulk-archive-row bulk-archive-group-head"
                    checked={tickState(group.entries).checked}
                    indeterminate={tickState(group.entries).indeterminate}
                    onChange={(value) => setMany(group.entries, value)}
                  >
                    <span class="bulk-archive-name">{group.name}</span>
                    <span class="bulk-archive-count">{group.entries.length}</span>
                  </Checkbox>
                  <div class="bulk-archive-sessions">
                    <For each={group.entries}>
                      {(entry) => (
                        <Checkbox
                          appearance="compact"
                          class="bulk-archive-row"
                          checked={picked[entry.key] === true}
                          onChange={(value) => setPicked(entry.key, value)}
                        >
                          <span class="bulk-archive-name">{sessionLabel(entry.session)}</span>
                          <StatusMark status={entry.status} />
                        </Checkbox>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </MenuScroll>
        </Show>
      </DialogBody>
      <DialogFooter>
        <Button variant="neutral" autofocus onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button disabled={selected().length === 0} onClick={confirm}>
          {language.plural("replica.bulkArchive.confirm", selected().length)}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
