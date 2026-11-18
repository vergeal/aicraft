import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { AccountNameInput } from "./account-name"
import type { ProviderAccount } from "./accounts"

/**
 * The accounts one provider stores: which one is active, renaming or removing one, and adding another. Settings and
 * the connect dialog show the same list, so it lives here instead of growing two appearances.
 */
export function ProviderAccountList(props: {
  accounts: readonly ProviderAccount[]
  activeID?: string
  /** The connect dialog's 15px rhythm. Settings lists use the denser 13px one. */
  size?: "comfortable" | "compact"
  /** A request the caller keeps in flight: every row and the add button wait for it. */
  disabled?: boolean
  /** The removal question for one account. The caller words it because removing the last one disconnects. */
  removeConfirm: (account: ProviderAccount, final: boolean) => string
  onActivate: (account: ProviderAccount) => void
  onRename: (account: ProviderAccount, label: string) => Promise<boolean>
  onRemove: (account: ProviderAccount) => void
  /** An account whose credential needs signing in again takes this path instead of activating. */
  onReconnect?: (account: ProviderAccount) => void
  onAdd?: () => void
  addDisabled?: boolean
}) {
  const language = useLanguage()
  const [state, setState] = createSignal<{ renaming?: string; confirming?: string }>({})

  const final = () => props.accounts.length === 1
  const row = () => (props.size === "compact" ? "min-h-8" : "min-h-7")
  const text = () =>
    props.size === "compact" ? "text-[13px] leading-[18px]" : "text-[15px] leading-5 tracking-[-0.04px]"

  const select = (account: ProviderAccount) => {
    if (account.status && props.onReconnect) return props.onReconnect(account)
    props.onActivate(account)
  }

  const remove = (account: ProviderAccount) => {
    setState({ confirming: undefined })
    props.onRemove(account)
  }

  return (
    <div data-component="provider-accounts" class="flex flex-col gap-0.5">
      <div
        role="radiogroup"
        aria-label={language.t("dialog.provider.accounts.connected")}
        class="flex flex-col gap-0.5"
      >
        <For each={props.accounts}>
          {(account) => (
            <Show
              when={state().confirming !== account.id}
              fallback={
                <div class={`flex ${row()} items-center gap-1.5 rounded-md ps-7 pe-0.5 ${text()}`}>
                  {/* The question is longer than an account name, so it wraps: a one-line ellipsis hid the half that
                      says whether removing this account disconnects the provider. */}
                  <span role="alert" class="min-w-0 flex-1 text-v2-text-text-base">
                    {props.removeConfirm(account, final())}
                  </span>
                  <Button variant="ghost-muted" onClick={() => setState({ confirming: undefined })}>
                    {language.t("common.cancel")}
                  </Button>
                  <Button variant="neutral" onClick={() => remove(account)}>
                    {language.t("dialog.provider.accounts.remove")}
                  </Button>
                </div>
              }
            >
              <div class={`group relative flex ${row()} items-center rounded-md hover:bg-v2-overlay-simple-overlay-hover focus-within:bg-v2-overlay-simple-overlay-hover has-[[data-expanded]]:bg-v2-overlay-simple-overlay-hover`}>
                <Show
                  when={state().renaming !== account.id}
                  fallback={
                    <div class={`flex ${row()} min-w-0 flex-1 items-center ps-7 pe-2`}>
                      <AccountNameInput
                        value={account.label}
                        class={`-ms-1 max-w-full ${text()} text-v2-text-text-base`}
                        onSave={(label) => props.onRename(account, label)}
                        onClose={() => setState({ renaming: undefined })}
                      />
                    </div>
                  }
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={props.activeID === account.id}
                    class={`flex ${row()} min-w-0 flex-1 items-center gap-1.5 ps-1.5 pe-2 text-start ${text()} focus-visible:outline-none disabled:pointer-events-none`}
                    disabled={props.disabled}
                    onClick={() => select(account)}
                  >
                    <span class="flex size-4 shrink-0 items-center justify-center">
                      <Show when={props.activeID === account.id}>
                        <Icon name="check" size="small" class="text-v2-icon-icon-base" />
                      </Show>
                    </span>
                    <span class="min-w-0 truncate text-v2-text-text-base">{account.label}</span>
                    <Show when={account.status}>
                      {(status) => (
                        <span
                          data-slot="provider-account-status"
                          title={status().message}
                          class="ms-auto shrink-0 text-[var(--v2-state-fg-warning)]"
                        >
                          {language.t("dialog.provider.needsSignIn")}
                        </span>
                      )}
                    </Show>
                  </button>
                </Show>
                <div class="hover-reveal flex shrink-0 items-center pe-1 group-hover:opacity-100 focus-within:opacity-100 has-[[data-expanded]]:opacity-100">
                  <Menu gutter={4} modal={false} placement="bottom-end">
                    <Menu.Trigger
                      as={IconButton}
                      variant="ghost-muted"
                      size="small"
                      icon={<Icon name="outline-dots" />}
                      disabled={props.disabled}
                      aria-label={language.t("dialog.provider.accounts.options", { account: account.label })}
                    />
                    {/* The dialog aria-hides anything added outside it, this portal included, a frame after it opens.
                        Kobalte leaves a node marked as a top layer visible. */}
                    <Menu.Portal
                      ref={(el) => {
                        el.dataset.reactAriaTopLayer = "true"
                      }}
                    >
                      <Menu.Content
                        onCloseAutoFocus={(event) => state().renaming && event.preventDefault()}
                      >
                        <Menu.Item onSelect={() => setState({ renaming: account.id, confirming: undefined })}>
                          {language.t("common.rename")}
                        </Menu.Item>
                        <Menu.Item onSelect={() => setState({ confirming: account.id, renaming: undefined })}>
                          {language.t("dialog.provider.accounts.remove")}
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu>
                </div>
              </div>
            </Show>
          )}
        </For>
      </div>
      <Show when={props.onAdd}>
        <button
          type="button"
          data-action="provider-account-add"
          class={`flex ${props.size === "compact" ? "h-8" : "h-7"} w-full items-center gap-1.5 rounded-md ps-1.5 pe-2 text-start ${text()} text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none disabled:pointer-events-none`}
          disabled={props.disabled || props.addDisabled}
          onClick={() => props.onAdd?.()}
        >
          <span class="flex size-4 shrink-0 items-center justify-center">
            <Icon name="plus" class="text-v2-icon-icon-muted" />
          </span>
          {language.t("dialog.provider.accounts.add")}
        </button>
      </Show>
    </div>
  )
}
