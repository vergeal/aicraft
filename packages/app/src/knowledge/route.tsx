import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { ContextMenu } from "@opencode/ui/context-menu"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Markdown } from "@opencode/session-ui/markdown"
import { MarkdownProvider } from "@opencode/session-ui/context/markdown"
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { createModuleSearch, ModuleGroup, ModuleHeader, ModulePage, ModuleSearch } from "@/shell/module-page"
import { useKnowledge } from "./context"
import { DiscardChip, ImportPanel } from "./model"
import { FILE_ICONS, groupLabel, isConverted, isMarkdown, sourceExtension } from "./display"
import type { KnowledgeFile, KnowledgeLibrary } from "./store"
import "./knowledge.css"

/**
 * The knowledge workspace: one fused page. The library list and the open library share the same surface, so the
 * sidebar keeps only the conversation list.
 */
export function KnowledgeScreen() {
  const knowledge = useKnowledge()

  return (
    <Show when={knowledge.library()} fallback={<LibraryList />}>
      {(library) => <LibraryDetail library={library()} />}
    </Show>
  )
}

function LibraryList() {
  const language = useLanguage()
  const knowledge = useKnowledge()
  const search = createModuleSearch()
  const libraries = createMemo(() => knowledge.libraries.libraries())
  const needle = () => search.query().trim().toLocaleLowerCase()
  const matches = (library: KnowledgeLibrary) =>
    !needle() ||
    `${library.name}\n${library.summary ?? ""}\n${library.description ?? ""}`.toLocaleLowerCase().includes(needle())
  const results = createMemo(() => libraries().filter(matches))

  const open = (library: KnowledgeLibrary) => {
    search.close()
    knowledge.openLibrary(library)
  }

  return (
    <ModulePage label={language.t("knowledge.title")}>
      <ModuleHeader
        title={language.t("knowledge.title")}
        count={
          libraries().length
            ? language.plural("knowledge.libraries", libraries().length, { count: libraries().length })
            : undefined
        }
        description={language.t("knowledge.description")}
        actions={
          <>
            <Button
              size="small"
              variant="ghost-muted"
              icon="magnifying-glass"
              aria-label={language.t("replica.nav.search")}
              onClick={search.show}
            />
            <Button variant="contrast" size="small" icon="plus" onClick={knowledge.openNewLibrary}>
              {language.t("knowledge.new")}
            </Button>
          </>
        }
      />

      <Show
        when={libraries().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span class="flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-v2-background-bg-layer-02 text-v2-text-text-faint">
              <Icon name="library" />
            </span>
            <p class="text-[13px] leading-5 font-medium">{language.t("knowledge.empty")}</p>
            <p class="max-w-80 text-[12px] leading-[var(--line-height-base)] text-v2-text-text-muted">
              {language.t("knowledge.empty.hint")}
            </p>
            <Button variant="neutral" size="small" icon="plus" onClick={knowledge.openNewLibrary}>
              {language.t("knowledge.new")}
            </Button>
          </div>
        }
      >
        <Show
          when={results().length > 0}
          fallback={<p class="module-search-empty">{language.t("knowledge.files.noResults")}</p>}
        >
          <div class="module-grid">
            <For each={results()}>
              {(library) => (
                <ContextMenu>
                  <ContextMenu.Trigger class="flex min-w-0 flex-col">
                    <article class="module-card flex-1">
                      <button type="button" class="module-card-head" onClick={() => open(library)}>
                        <span class="module-card-glyph">
                          <Icon name="library" size="small" />
                        </span>
                        <span class="module-card-title">
                          <strong class="truncate">{library.name}</strong>
                          <span class="module-card-meta">
                            <span>
                              {language.plural("knowledge.files", library.files.length, {
                                count: library.files.length,
                              })}
                            </span>
                          </span>
                        </span>
                      </button>
                      <p dir="auto" class="module-card-desc line-clamp-2">
                        {library.summary || library.description || language.t("knowledge.summary.empty")}
                      </p>
                    </article>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content>
                      <ContextMenu.Item onSelect={() => open(library)}>
                        <ContextMenu.ItemLabel>{language.t("knowledge.files.menu.open")}</ContextMenu.ItemLabel>
                      </ContextMenu.Item>
                      <ContextMenu.Separator />
                      <ContextMenu.Item onSelect={() => knowledge.removeLibrary(library)}>
                        <ContextMenu.ItemLabel>{language.t("knowledge.delete")}</ContextMenu.ItemLabel>
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <ModuleSearch
        state={search}
        label={language.t("replica.nav.search")}
        placeholder={language.t("knowledge.search.placeholder")}
        hint={
          needle()
            ? results().length
              ? language.plural("knowledge.search.results", results().length, { count: results().length })
              : undefined
            : undefined
        }
      >
        <Show
          when={results().length > 0}
          fallback={<p class="module-search-empty">{language.t("knowledge.search.empty")}</p>}
        >
          <For each={results()}>
            {(library) => (
              <button type="button" class="module-search-hit" onClick={() => open(library)}>
                <Icon name="library" size="small" />
                <span class="module-search-hit-label">{library.name}</span>
                <span class="text-[12px] text-v2-text-text-faint">
                  {language.plural("knowledge.files", library.files.length, { count: library.files.length })}
                </span>
              </button>
            )}
          </For>
        </Show>
      </ModuleSearch>
    </ModulePage>
  )
}

function LibraryDetail(props: { library: KnowledgeLibrary }) {
  const language = useLanguage()
  const platform = usePlatform()
  const knowledge = useKnowledge()
  const search = createModuleSearch()

  // The model already owns the filtered, grouped file list; the page search is its one input.
  createEffect(() => knowledge.setQuery(search.query()))
  onCleanup(() => knowledge.setQuery(""))

  const selected = () => knowledge.selectedFiles()
  const flagged = () => knowledge.flaggedIn(props.library, selected()).length
  const intro = () => props.library.summary || props.library.description || language.t("knowledge.summary.empty")
  const rows = () => knowledge.fileGroups()

  const card = (file: KnowledgeFile) => {
    const open = () => knowledge.previewPath() === file.path

    return (
      <article class="module-card" data-open={open() ? "" : undefined}>
        <div class="module-file-row">
          <Checkbox
            hideLabel
            checked={selected().includes(file.path)}
            onChange={(checked) => knowledge.toggleFile(file.path, checked)}
          >
            {file.name}
          </Checkbox>
          <button
            type="button"
            class="module-file-open"
            aria-expanded={open()}
            title={file.source || file.path}
            onClick={() => (open() ? knowledge.closePreview() : void knowledge.openFile(props.library, file))}
          >
            <Icon name={FILE_ICONS[file.kind]} size="small" class="shrink-0" />
            <span dir="auto" class="min-w-0 flex-1 truncate">
              {file.name}
            </span>
            <Show when={isConverted(file)}>
              <span class="knowledge-ext-badge shrink-0">{sourceExtension(file)}</span>
            </Show>
          </button>
          <Show when={knowledge.flagOf(props.library, file.path)}>
            {(flag) => (
              <button
                type="button"
                class="knowledge-flag shrink-0"
                title={flag().reason || language.t("knowledge.flags.irrelevant")}
                onClick={() => knowledge.openFlag(props.library, file, flag())}
              >
                {language.t("knowledge.flags.irrelevant")}
              </button>
            )}
          </Show>
          <Icon name="chevron-down" size="small" class="module-card-trail shrink-0" />
        </div>

        <Show when={open()}>
          <div class="module-card-body">
            <Show
              when={knowledge.preview().status !== "loading"}
              fallback={
                <div class="flex justify-center py-4">
                  <Loader />
                </div>
              }
            >
              <Show
                when={knowledge.preview().status === "failed"}
                fallback={
                  <Show
                    when={isMarkdown(file.path)}
                    fallback={
                      <pre class="knowledge-file-preview font-mono text-[13px] leading-[var(--line-height-base)]">
                        {knowledge.previewText() || language.t("knowledge.preview.unreadable")}
                      </pre>
                    }
                  >
                    <KnowledgeDocument text={knowledge.previewText()} cacheKey={file.path} />
                  </Show>
                }
              >
                <div class="knowledge-preview-error" role="alert">
                  <span class="knowledge-preview-error-message">
                    {language.t("knowledge.preview.failed", { message: knowledge.previewMessage() })}
                  </span>
                  <Button size="small" variant="neutral" onClick={knowledge.retryPreview}>
                    {language.t("knowledge.preview.retry")}
                  </Button>
                </div>
              </Show>
            </Show>
          </div>
        </Show>
      </article>
    )
  }

  return (
    <ModulePage label={props.library.name}>
      <ModuleHeader
        title={props.library.name}
        description={intro()}
        actions={
          <>
            <Button
              size="small"
              variant="ghost-muted"
              icon="outline-arrow-left"
              aria-label={language.t("knowledge.back")}
              onClick={() => knowledge.closeLibrary()}
            />
            <Button
              size="small"
              variant="ghost-muted"
              icon="magnifying-glass"
              aria-label={language.t("replica.nav.search")}
              onClick={search.show}
            />
            <Button
              size="small"
              variant="contrast"
              disabled={knowledge.importing() || platform.platform !== "desktop"}
              onClick={() => void knowledge.runImport()}
            >
              <Show when={knowledge.importing()} fallback={<Icon name="folder-add-left" size="small" />}>
                <Loader class="size-3.5" />
              </Show>
              {language.t("knowledge.import")}
            </Button>
            <Button
              size="small"
              variant="ghost-muted"
              icon="trash"
              aria-label={language.t("knowledge.delete")}
              onClick={() => knowledge.removeLibrary(props.library)}
            />
          </>
        }
      />

      <div class="knowledge-page-meta">
        <Show when={props.library.sources.length}>
          <span dir="auto" class="truncate" title={props.library.sources.join("\n")}>
            {sourceLabel(props.library, language)}
          </span>
        </Show>
        <Show when={!knowledge.importing() && knowledge.skipCount(props.library, "duplicate")}>
          {(count) => (
            <DiscardChip
              label={language.plural("knowledge.import.duplicates", count(), { count: count() })}
              onOpen={
                knowledge.discardsOf(props.library, "duplicate").length
                  ? () => knowledge.openDiscards(props.library, "duplicate")
                  : undefined
              }
            />
          )}
        </Show>
        <Show when={!knowledge.importing() && knowledge.skipCount(props.library, "similar")}>
          {(count) => (
            <DiscardChip
              label={language.plural("knowledge.import.similar", count(), { count: count() })}
              onOpen={
                knowledge.discardsOf(props.library, "similar").length
                  ? () => knowledge.openDiscards(props.library, "similar")
                  : undefined
              }
            />
          )}
        </Show>
        <Show when={!knowledge.importing() && knowledge.skipCount(props.library, "ignored")}>
          {(count) => (
            <DiscardChip
              label={language.plural("knowledge.import.ignored", count(), { count: count() })}
              onOpen={
                knowledge.discardsOf(props.library, "ignored").length
                  ? () => knowledge.openDiscards(props.library, "ignored")
                  : undefined
              }
            />
          )}
        </Show>
        <Show when={!knowledge.importing() && platform.platform !== "desktop"}>
          <span class="knowledge-chip">{language.t("knowledge.import.desktopOnly")}</span>
        </Show>
        <Show when={!knowledge.importing() && knowledge.flaggedPaths(props.library).length}>
          {(count) => (
            <button
              type="button"
              class="knowledge-ghost-button knowledge-flag-action"
              onClick={() => knowledge.confirmRemoveFlagged(props.library)}
            >
              <Icon name="outline-hexagonal-warning" size="small" />
              {language.plural("knowledge.flags.removeAll", count(), { count: count() })}
            </button>
          )}
        </Show>
      </div>

      <Show when={knowledge.importError()}>
        {(message) => (
          <div class="knowledge-error" role="alert">
            <Icon name="circle-xmark" size="small" class="shrink-0" />
            <span class="min-w-0 flex-1 break-words">
              {language.t("knowledge.import.failed", { message: message() })}
            </span>
            <button
              type="button"
              class="knowledge-ghost-button"
              onClick={knowledge.dismissImportError}
              aria-label={language.t("common.dismiss")}
            >
              <Icon name="xmark" size="small" />
            </button>
          </div>
        )}
      </Show>

      <Show
        when={knowledge.job()}
        fallback={
          <Show
            when={knowledge.visibleFiles().length > 0 || knowledge.query()}
            fallback={
              <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <span class="flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-v2-background-bg-layer-02 text-v2-text-text-faint">
                  <Icon name="file-document" />
                </span>
                <p class="text-[13px] leading-5 font-medium">{language.t("knowledge.files.empty")}</p>
                <p class="max-w-80 text-[12px] leading-[var(--line-height-base)] text-v2-text-text-muted">
                  {language.t("knowledge.files.empty.hint")}
                </p>
              </div>
            }
          >
            <Show when={props.library.files.length > 0}>
              <div class="knowledge-files-bar">
                <Checkbox
                  checked={knowledge.allVisibleSelected()}
                  onChange={(checked) => knowledge.toggleVisible(checked)}
                >
                  <span class="text-[12px] leading-[var(--line-height-compact)]">
                    {language.t("knowledge.files.select")}
                  </span>
                </Checkbox>
                <Show when={selected().length > 0}>
                  <span class="knowledge-files-count">
                    {language.plural("knowledge.files.selected", selected().length, { count: selected().length })}
                  </span>
                </Show>
                <span class="knowledge-files-push" aria-hidden="true" />
                <Show when={selected().some((path) => !knowledge.flagOf(props.library, path))}>
                  <Button
                    size="small"
                    variant="ghost-muted"
                    icon="outline-hexagonal-warning"
                    aria-label={language.t("knowledge.flags.mark")}
                    onClick={() => knowledge.markSelection()}
                  />
                </Show>
                <Show when={flagged() > 0}>
                  <Button
                    size="small"
                    variant="ghost-muted"
                    icon="outline-xmark"
                    aria-label={language.t("knowledge.flags.unmark")}
                    onClick={() => knowledge.unmarkSelection()}
                  />
                </Show>
                <Show when={selected().length > 0}>
                  <Button
                    size="small"
                    variant="ghost-muted"
                    icon="trash"
                    aria-label={language.t("knowledge.files.delete")}
                    onClick={() => knowledge.confirmRemoveFiles()}
                  />
                </Show>
              </div>
            </Show>

            <Show
              when={rows().length > 0}
              fallback={<p class="module-search-empty">{language.t("knowledge.files.noResults")}</p>}
            >
              <For each={rows()}>
                {([directory, files]) => (
                  <ModuleGroup
                    title={directory ? groupLabel(directory) : language.t("knowledge.files.root")}
                    count={files.length}
                  >
                    <For each={files}>{card}</For>
                  </ModuleGroup>
                )}
              </For>
            </Show>
          </Show>
        }
      >
        {(job) => <ImportPanel job={job()} />}
      </Show>

      <ModuleSearch
        state={search}
        label={language.t("knowledge.files.search")}
        placeholder={language.t("knowledge.files.search")}
        hint={
          knowledge.query().trim()
            ? knowledge.visibleFiles().length
              ? language.plural("knowledge.search.results", knowledge.visibleFiles().length, {
                  count: knowledge.visibleFiles().length,
                })
              : undefined
            : undefined
        }
      >
        <Show
          when={knowledge.visibleFiles().length > 0}
          fallback={<p class="module-search-empty">{language.t("knowledge.files.noResults")}</p>}
        >
          <For each={knowledge.visibleFiles()}>
            {(file) => (
              <button
                type="button"
                class="module-search-hit"
                onClick={() => {
                  search.close()
                  void knowledge.openFile(props.library, file)
                }}
              >
                <Icon name={FILE_ICONS[file.kind]} size="small" />
                <span class="module-search-hit-label">{file.name}</span>
                <span class="text-[12px] text-v2-text-text-faint">{sourceLabel(props.library, language)}</span>
              </button>
            )}
          </For>
        </Show>
      </ModuleSearch>
    </ModulePage>
  )
}

/** A stored Markdown document reads as a page: the artifact view's surface, sized to an A4 sheet. */
function KnowledgeDocument(props: { text: string; cacheKey?: string }) {
  return (
    <div data-slot="knowledge-document">
      <div data-slot="artifact-markdown-page" data-component="document-surface">
        <div data-slot="artifact-markdown-content">
          <MarkdownProvider>
            <Markdown text={props.text} cacheKey={props.cacheKey} />
          </MarkdownProvider>
        </div>
      </div>
    </div>
  )
}

/**
 * The header second line. A long list of absolute paths would be unreadable, so the folders and files
 * are shortened to their own names and the whole set is available as the tooltip.
 */
function sourceLabel(library: KnowledgeLibrary, language: ReturnType<typeof useLanguage>) {
  if (!library.sources.length) {
    return language.plural("knowledge.files", library.files.length, { count: library.files.length })
  }

  const names = library.sources.map((source) => source.split(/[\\/]/).filter(Boolean).pop() ?? source)
  const shown = names.slice(0, 2).join(" · ")

  return names.length > 2
    ? `${shown} · ${language.plural("knowledge.sources", names.length, { count: names.length })}`
    : shown
}
