import type { SkillInfo } from "@aicraft/client/promise"
import { Button } from "@aicraft/ui/button"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@aicraft/ui/dialog"
import { Switch } from "@aicraft/ui/switch"
import { MarkdownProvider } from "@aicraft/session-ui/context/markdown"
import { Markdown } from "@aicraft/session-ui/markdown"
import { getDirectory, getFilename } from "@aicraft/util/path"
import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useExploreInstalled } from "@/explore/installed"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { showToast } from "@/shell/notifications/toast"
import "./explore.css"
import type { CatalogSkill } from "./catalog"

export const isBuiltinSkill = (skill: SkillInfo) => skill.path.startsWith("skill://") || skill.path.startsWith("/builtin/")

/**
 * Rewrites `metadata.aicraft/autoinvoke` in a SKILL.md frontmatter block, leaving every other byte of the file
 * intact. The server reads that key before `disable-model-invocation`, so writing it always wins.
 */
function withAutoinvoke(text: string, enabled: boolean) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n"
  const value = String(enabled)
  const match = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text)

  if (!match) return `---${eol}metadata:${eol}  opencode/autoinvoke: ${value}${eol}---${eol}${text}`

  const [, open, frontmatter, close] = match
  const lines = frontmatter.split(/\r?\n/)
  const metadata = lines.findIndex((line) => /^metadata[ \t]*:[ \t]*(?:#.*)?$/.test(line))

  if (metadata === -1) {
    if (lines.some((line) => /^metadata[ \t]*:/.test(line))) throw new Error("unsupported frontmatter")

    lines.push("metadata:", `  opencode/autoinvoke: ${value}`)
  } else {
    const end = lines.findIndex((line, index) => index > metadata && line.trim() !== "" && !/^[ \t]/.test(line))
    const stop = end === -1 ? lines.length : end

    const existing = lines.findIndex(
      (line, index) => index > metadata && index < stop && /^([ \t]+)aicraft\/autoinvoke[ \t]*:/.test(line),
    )

    if (existing !== -1) {
      const indent = /^[ \t]+/.exec(lines[existing])![0]

      lines[existing] = `${indent}opencode/autoinvoke: ${value}`
    } else {
      const child = lines.slice(metadata + 1, stop).find((line) => line.trim() !== "")
      const indent = child ? (/^[ \t]+/.exec(child)?.[0] ?? "  ") : "  "

      lines.splice(metadata + 1, 0, `${indent}opencode/autoinvoke: ${value}`)
    }
  }

  return `${open}${lines.join(eol)}${close}${text.slice(match[0].length)}`
}

function readText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes)
}

function trimDirectory(directory: string) {
  return directory.replace(/[\\/]+$/, "")
}

/** The SKILL.md a new skill needs: frontmatter, then the instructions the model reads. */
function composeSkill(input: { name: string; description: string; instructions: string }) {
  const body = input.instructions.trim() || `# ${input.name}\n\n${input.description}`

  return [
    "---",
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(input.description)}`,
    "---",
    "",
    body,
    "",
  ].join("\n")
}

/** A SKILL.md body, rendered with the same Markdown surface the rest of the app uses for documents. */
function SkillDocument(props: { text: string; cacheKey: string }) {
  return (
    <div class="module-skill-doc" data-scrollable>
      <div data-slot="artifact-markdown-content">
        <MarkdownProvider>
          <Markdown text={props.text} cacheKey={props.cacheKey} />
        </MarkdownProvider>
      </div>
    </div>
  )
}

/** Copies the `@id` mention that references this skill. It sits beside the detail page's title. */
export function SkillReferenceButton(props: { skill: SkillInfo }) {
  const language = useLanguage()
  const platform = usePlatform()

  const copy = async () => {
    try {
      await (platform.writeClipboardText?.(`@${props.skill.id}`) ?? navigator.clipboard.writeText(`@${props.skill.id}`))
      showToast({ variant: "success", title: language.t("settings.skills.copiedReference") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.skills.copyFailed") })
    }
  }

  return (
    <Button size="small" variant="ghost-muted" onClick={() => void copy()}>
      @{props.skill.id}
    </Button>
  )
}

/** An installed skill's own page: its rules and the actions on it. */
export function InstalledSkillDetail(props: { skill: SkillInfo }) {
  const language = useLanguage()
  const data = useData()
  const serverSdk = useServerSDK()
  const platform = usePlatform()
  const dialog = useDialog()
  const installed = useExploreInstalled()

  const [local, setLocal] = createStore<{ toggling: boolean; value?: boolean }>({ toggling: false })

  const directory = () => installed.directory()
  const autoinvokeOn = () => local.value ?? props.skill.autoinvoke !== false

  // The switch is optimistic until the rescan reports the written value, then it follows the server again.
  createEffect(() => {
    if (local.value !== undefined && (props.skill.autoinvoke !== false) === local.value) setLocal("value", undefined)
  })

  const syncSkills = (target: string) => data.location.skill.sync({ directory: target })

  const writeSkillFile = (path: string, text: string) =>
    serverSdk.api.experimental.file.write({
      path,
      payload: new TextEncoder().encode(text),
      location: { directory: directory() },
    })

  const readSkill = async (skill: SkillInfo) => {
    if (isBuiltinSkill(skill)) return skill.content

    const bytes = await serverSdk.api.file.read({
      path: getFilename(skill.path),
      location: { directory: getDirectory(skill.path) },
    })

    return readText(bytes)
  }

  const toggleAutoinvoke = async (enabled: boolean) => {
    if (isBuiltinSkill(props.skill) || local.toggling) return

    setLocal("toggling", true)

    try {
      await writeSkillFile(props.skill.path, withAutoinvoke(await readSkill(props.skill), enabled))
      setLocal("value", enabled)
      void syncSkills(directory())
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("settings.skills.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLocal("toggling", false)
    }
  }

  const reveal = () => {
    const target = getDirectory(props.skill.path).replace(/[\\/]+$/, "")

    if (platform.revealPath) {
      void platform.revealPath(target).then((shown) => {
        if (!shown) void platform.openPath?.(target)
      })

      return
    }

    void platform.openPath?.(target)
  }

  // VS Code is the default editor; other systems fall back to whatever app owns the file.
  const openInEditor = async () => {
    if (!platform.openPath) return

    const application = platform.os === "macos" ? "Visual Studio Code" : undefined

    try {
      await platform.openPath(props.skill.path, application)
    } catch {
      if (!application) {
        showToast({ variant: "error", title: language.t("settings.skills.openEditorFailed") })

        return
      }

      try {
        await platform.openPath(props.skill.path)
      } catch {
        showToast({ variant: "error", title: language.t("settings.skills.openEditorFailed") })
      }
    }
  }

  const remove = async () => {
    if (isBuiltinSkill(props.skill)) return

    const text = await readSkill(props.skill).catch((error) => {
      showToast({
        variant: "error",
        title: language.t("explore.skills.remove.failed"),
        description: error instanceof Error ? error.message : undefined,
      })

      return undefined
    })

    if (text === undefined) return

    void dialog.show(() => (
      <RemoveSkillDialog
        skill={props.skill}
        text={text}
        directory={directory()}
        onRemoved={() => {
          void syncSkills(directory())
          showToast({
            variant: "success",
            title: language.t("explore.skills.remove.success", { name: props.skill.name }),
          })
        }}
      />
    ))
  }

  return (
    <div class="explore-detail">
      <Show when={props.skill.description}>
        {(description) => <p class="explore-catalog-about">{description()}</p>}
      </Show>

      <div class="explore-catalog-toggle">
        <div class="explore-catalog-toggle-copy">
          <span class="explore-catalog-toggle-title">{language.t("settings.skills.autoinvoke.title")}</span>
          <p class="explore-catalog-toggle-description">
            {language.t(
              isBuiltinSkill(props.skill) ? "settings.skills.autoinvoke.builtin" : "settings.skills.autoinvoke.description",
            )}
          </p>
        </div>
        <Switch
          checked={autoinvokeOn()}
          disabled={isBuiltinSkill(props.skill) || local.toggling}
          hideLabel
          onChange={(enabled) => void toggleAutoinvoke(enabled)}
        >
          {language.t("settings.skills.autoinvoke.title")}
        </Switch>
      </div>

      <Show when={!isBuiltinSkill(props.skill)}>
        <span class="explore-catalog-path" dir="ltr" title={props.skill.path}>
          {props.skill.path}
        </span>
      </Show>

      <SkillDocument text={props.skill.content} cacheKey={`${props.skill.id}:${props.skill.path}`} />

      <Show when={!isBuiltinSkill(props.skill)}>
        <p class="explore-note">{language.t("explore.skills.remove.hint")}</p>
      </Show>

      <Show when={!isBuiltinSkill(props.skill)}>
        <div class="module-card-foot">
          <Button
            size="small"
            variant="ghost-muted"
            icon="outline-code-brackets"
            disabled={!platform.openPath}
            onClick={() => void openInEditor()}
          >
            {language.t("settings.skills.openEditor")}
          </Button>
          <Button
            size="small"
            variant="ghost-muted"
            icon="folder"
            disabled={!platform.revealPath && !platform.openPath}
            onClick={reveal}
          >
            {language.t("settings.skills.reveal")}
          </Button>
          <Button size="small" variant="ghost-danger" icon="trash" onClick={() => void remove()}>
            {language.t("explore.skills.remove")}
          </Button>
        </div>
      </Show>
    </div>
  )
}

/** A catalog skill's own page: what it writes and the install action. */
export function CatalogSkillDetail(props: { entry: CatalogSkill }) {
  const language = useLanguage()
  const dialog = useDialog()
  const data = useData()
  const installed = useExploreInstalled()

  const install = () =>
    void dialog.show(() => (
      <InstallSkillDialog
        directory={installed.directory()}
        initial={{
          id: props.entry.id,
          name: props.entry.title,
          description: props.entry.description,
          instructions: props.entry.instructions,
        }}
        onInstalled={() => {
          void data.location.skill.sync({ directory: installed.directory() })
          showToast({ variant: "success", title: language.t("explore.skills.install.success") })
        }}
      />
    ))

  return (
    <div class="explore-detail">
      <p class="explore-catalog-about">{props.entry.description}</p>

      <SkillDocument text={props.entry.instructions} cacheKey={props.entry.id} />

      <div class="module-card-foot">
        <Button variant="contrast" size="small" icon="plus" onClick={install}>
          {language.t("explore.skills.install")}
        </Button>
      </div>
    </div>
  )
}

/**
 * Installing a catalog skill is a review, not an edit: the sheet shows the SKILL.md the row will write, and the only
 * action is the confirmation that writes it. The explore page never lets a visitor change a catalog entry.
 */
export function InstallSkillDialog(props: {
  directory: string
  initial: { id: string; name: string; description: string; instructions: string }
  onInstalled: (id: string) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const serverSdk = useServerSDK()

  const [state, setState] = createStore({ busy: false, error: "" })

  const root = () => trimDirectory(props.directory)
  const target = () => `${root()}/.aicraft/skill/${props.initial.id}/SKILL.md`

  const submit = async () => {
    if (state.busy) return

    setState({ busy: true, error: "" })

    try {
      await serverSdk.api.experimental.file.write({
        path: target(),
        payload: new TextEncoder().encode(
          composeSkill({
            name: props.initial.name,
            description: props.initial.description,
            instructions: props.initial.instructions,
          }),
        ),
        location: { directory: props.directory },
      })
      dialog.close()
      props.onInstalled(props.initial.id)
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <Dialog size="x-large">
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("explore.skills.install.title")}
          description={language.t("explore.skills.install.description")}
        />
      </DialogHeader>

      <DialogBody flush class="explore-skill-body">
        <div class="explore-skill-scroll">
          <div data-component="document-surface" class="explore-skill-paper">
            <article class="explore-skill-page">
              <h1 class="explore-skill-preview-name">{props.initial.name}</h1>
              <p class="explore-skill-preview-summary">{props.initial.description}</p>

              <div class="explore-skill-divider" role="presentation" />

              <div class="explore-skill-preview-body" data-slot="artifact-markdown-content">
                <MarkdownProvider>
                  <Markdown text={props.initial.instructions} cacheKey={props.initial.id} />
                </MarkdownProvider>
              </div>
            </article>
          </div>

          <div class="explore-skill-foot">
            <p class="explore-skill-hint">{language.t("explore.skills.install.hint")}</p>
            <p class="explore-skill-path" dir="ltr" title={target()}>
              {target()}
            </p>
          </div>

          <Show when={state.error}>
            {(message) => (
              <p class="explore-form-error" role="alert">
                {message()}
              </p>
            )}
          </Show>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="neutral" disabled={state.busy} onClick={() => dialog.close()}>
          {language.t("explore.skills.install.cancel")}
        </Button>
        <Button variant="submit" disabled={state.busy} aria-busy={state.busy} onClick={() => void submit()}>
          {language.t("explore.skills.install.submit")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function RemoveSkillDialog(props: { skill: SkillInfo; text: string; directory: string; onRemoved: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const serverSdk = useServerSDK()
  const [state, setState] = createStore({ busy: false, error: "" })

  const backup = () => `${props.skill.path}.disabled`

  const remove = async () => {
    setState({ busy: true, error: "" })

    try {
      const write = (path: string, text: string) =>
        serverSdk.api.experimental.file.write({
          path,
          payload: new TextEncoder().encode(text),
          location: { directory: props.directory },
        })

      // Keep the original bytes, then empty SKILL.md so the file stays but no longer registers as a skill.
      await write(backup(), props.text)
      await write(props.skill.path, "")
      dialog.close()
      props.onRemoved()
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("explore.skills.remove.title", { name: props.skill.name })}
          description={language.t("explore.skills.remove.description")}
        />
      </DialogHeader>

      <DialogBody flush class="explore-install-body">
        <p class="explore-install-text">{language.t("explore.skills.remove.backup")}</p>
        <code class="explore-install-path" dir="ltr">
          {backup()}
        </code>
        <Show when={state.error}>
          {(message) => (
            <p class="explore-form-error" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </DialogBody>

      <DialogFooter>
        <Button variant="neutral" disabled={state.busy} onClick={() => dialog.close()}>
          {language.t("explore.skills.remove.cancel")}
        </Button>
        <Button variant="danger" disabled={state.busy} aria-busy={state.busy} onClick={() => void remove()}>
          {language.t("explore.skills.remove.confirm")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
