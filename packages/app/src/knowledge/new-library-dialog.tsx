import { Button } from "@aicraft/ui/button"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@aicraft/ui/dialog"
import { TextInput } from "@aicraft/ui/text-input"
import { Textarea } from "@aicraft/ui/textarea"
import { createSignal } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"

/** Names a new knowledge base and records what it is for before the workspace creates it. */
export function NewLibraryDialog(props: { onCreate: (name: string, description: string) => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")

  const create = () => {
    const value = name().trim()

    if (!value) return
    // Close first, so the caller can reveal the new library without stacking dialogs.
    dialog.close()
    props.onCreate(value, description().trim())
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={language.t("knowledge.new")} description={language.t("knowledge.new.description")} />
      </DialogHeader>
      <DialogBody class="flex w-full min-w-0 flex-col gap-4">
        <label class="flex w-full min-w-0 flex-col gap-1.5">
          <span class="text-[13px] leading-[var(--line-height-compact)] font-medium text-v2-text-text-base">
            {language.t("knowledge.name.label")}
          </span>
          <TextInput
            autofocus
            class="knowledge-name-field !w-full"
            value={name()}
            placeholder={language.t("knowledge.name.placeholder")}
            aria-label={language.t("knowledge.name.label")}
            onInput={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              create()
            }}
          />
        </label>
        <label class="flex w-full min-w-0 flex-col gap-1.5">
          <span class="text-[13px] leading-[var(--line-height-compact)] font-medium text-v2-text-text-base">
            {language.t("knowledge.new.about.label")}
          </span>
          <Textarea
            class="knowledge-description-field !w-full"
            rows={3}
            value={description()}
            placeholder={language.t("knowledge.new.about.placeholder")}
            aria-label={language.t("knowledge.new.about.label")}
            onInput={(event) => setDescription(event.currentTarget.value)}
          />
          <span class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-faint">
            {language.t("knowledge.new.about.hint")}
          </span>
        </label>
      </DialogBody>
      <DialogFooter>
        <Button variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="submit" disabled={!name().trim()} onClick={create}>
          {language.t("knowledge.create")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
