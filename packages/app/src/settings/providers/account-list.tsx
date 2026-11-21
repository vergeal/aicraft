import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { TextInput } from "@opencode/ui/text-input"
import { Tooltip } from "@opencode/ui/tooltip"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { AccountNameInput } from "./account-name"
import type { ProviderAccount } from "./accounts"
import "@/settings/providers/providers.css"

/** `sk-…abcd`: enough to tell two accounts apart without putting the secret on screen. */
export function maskSecret(value: string) {
  if (value.length <= 8) return "•".repeat(Math.max(value.length, 4))

  return `${value.slice(0, 3)}…${value.slice(-4)}`
}

/**
 * The accounts one provider stores: which one is active, the masked secret behind each row, renaming or removing one,
 * and adding another. Settings and the connect dialog show the same list, so it lives here instead of growing two
 * appearances.
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
  /** The stored secret for one account, in plain text. Rows mask it and reveal it on request. */
  secret?: (account: ProviderAccount) => string | undefined
  /** When given, "Add account" opens a name and key form instead of the caller's own flow. */
  create?: (input: { label: string; key: string }) => Promise<boolean>
}) {
  const language = useLanguage()
  const [state, setState] = createStore<{
    renaming?: string
    confirming?: string
    revealed: Record<string, boolean>
    adding: boolean
    saving: boolean
    label: string
    key: string
  }>({ revealed: {}, adding: false, saving: false, label: "", key: "" })

  const final = () => props.accounts.length === 1
  const text = () =>
    props.size === "compact" ? "text-[13px] leading-[18px]" : "text-[14px] leading-5 tracking-[-0.04px]"

  const select = (account: ProviderAccount) => {
    if (account.status && props.onReconnect) return props.onReconnect(account)
    props.onActivate(account)
  }

  const remove = (account: ProviderAccount) => {
    setState({ confirming: undefined })
    props.onRemove(account)
  }

  const openForm = () => {
    if (props.create) return setState({ adding: true, label: "", key: "" })
    props.onAdd?.()
  }

  const closeForm = () => setState({ adding: false, label: "", key: "" })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!props.create || state.saving) return

    const key = state.key.trim()
    if (!key) return
    setState("saving", true)

    if (await props.create({ label: state.label.trim(), key })) closeForm()
    else setState("saving", false)
  }

  const reveal = (account: ProviderAccount) =>
    setState("revealed", account.id, (value) => !value)

  return (
    <div data-component="provider-accounts" data-size={props.size ?? "comfortable"}>
      <div
        role="radiogroup"
        aria-label={language.t("dialog.provider.accounts.connected")}
        class="provider-accounts-list"
      >
        <For each={props.accounts}>
          {(account) => (
            <Show
              when={state.confirming !== account.id}
              fallback={
                <div class={`provider-account provider-account--confirm ${text()}`}>
                  {/* The question is longer than an account name, so it wraps: a one-line ellipsis hid the half that
                      says whether removing this account disconnects the provider. */}
                  <span role="alert" class="provider-account-confirm">
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
              <div class="provider-account" data-active={props.activeID === account.id || undefined}>
                <Show
                  when={state.renaming !== account.id}
                  fallback={
                    <div class="provider-account-rename">
                      <AccountNameInput
                        value={account.label}
                        class={`${text()} text-v2-text-text-base`}
                        onSave={(label) => props.onRename(account, label)}
                        onClose={() => setState("renaming", undefined)}
                      />
                    </div>
                  }
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={props.activeID === account.id}
                    class={`provider-account-select ${text()}`}
                    disabled={props.disabled}
                    onClick={() => select(account)}
                  >
                    <span class="provider-account-mark">
                      <Show when={props.activeID === account.id}>
                        <Icon name="check" size="small" class="text-v2-icon-icon-base" />
                      </Show>
                    </span>
                    <span class="provider-account-label">{account.label}</span>
                    <Show when={account.status}>
                      {(status) => (
                        <span
                          data-slot="provider-account-status"
                          title={status().message}
                          class="provider-account-status"
                        >
                          {language.t("dialog.provider.needsSignIn")}
                        </span>
                      )}
                    </Show>
                  </button>
                </Show>
                <Show when={props.secret?.(account)}>
                  {(secret) => (
                    <>
                      <span
                        data-slot="provider-account-key"
                        class="provider-account-key"
                        title={state.revealed[account.id] ? undefined : language.t("dialog.provider.accounts.reveal")}
                      >
                        {state.revealed[account.id] ? secret() : maskSecret(secret())}
                      </span>
                      <Tooltip
                        class="flex shrink-0 items-center"
                        placement="top"
                        value={language.t(
                          state.revealed[account.id]
                            ? "dialog.provider.accounts.hide"
                            : "dialog.provider.accounts.reveal",
                        )}
                      >
                        <IconButton
                          variant="ghost-muted"
                          size="small"
                          class="provider-account-reveal"
                          icon={<Icon name={state.revealed[account.id] ? "eye-closed" : "eye-open"} />}
                          aria-label={language.t(
                            state.revealed[account.id]
                              ? "dialog.provider.accounts.hide"
                              : "dialog.provider.accounts.reveal",
                          )}
                          aria-pressed={!!state.revealed[account.id]}
                          disabled={props.disabled}
                          onClick={() => reveal(account)}
                        />
                      </Tooltip>
                    </>
                  )}
                </Show>
                <div class="provider-account-actions">
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
                      <Menu.Content onCloseAutoFocus={(event) => state.renaming && event.preventDefault()}>
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

      <Show when={state.adding && props.create}>
        <form class="provider-account-form" onSubmit={submit}>
          <div class="provider-account-fields">
            <label class="provider-account-field">
              <span>{language.t("settings.providers.account.name")}</span>
              <TextInput
                appearance="base"
                surface="layer-1"
                value={state.label}
                placeholder={language.t("settings.providers.account.name.placeholder")}
                autocomplete="off"
                onInput={(event) => setState("label", event.currentTarget.value)}
              />
            </label>
            <label class="provider-account-field">
              <span>{language.t("dialog.provider.accounts.key")}</span>
              <TextInput
                appearance="base"
                surface="layer-1"
                type="password"
                value={state.key}
                placeholder={language.t("settings.providers.custom.apiKey.placeholder")}
                autocomplete="off"
                spellcheck={false}
                required
                onInput={(event) => setState("key", event.currentTarget.value)}
              />
            </label>
          </div>
          <div class="provider-account-form-actions">
            <Button variant="ghost-muted" onClick={closeForm}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="contrast" type="submit" disabled={state.saving || state.key.trim() === ""}>
              {language.t(state.saving ? "dialog.provider.accounts.saving" : "common.save")}
            </Button>
          </div>
        </form>
      </Show>

      <Show when={(props.onAdd || props.create) && !state.adding}>
        <button
          type="button"
          data-action="provider-account-add"
          class={`provider-account provider-account--add ${text()}`}
          disabled={props.disabled || props.addDisabled}
          onClick={openForm}
        >
          <span class="provider-account-mark">
            <Icon name="plus" class="text-v2-icon-icon-muted" />
          </span>
          {language.t("dialog.provider.accounts.add")}
        </button>
      </Show>
    </div>
  )
}
