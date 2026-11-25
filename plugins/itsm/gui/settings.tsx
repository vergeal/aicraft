import { createSignal, For, Show } from "solid-js"
import { usePlugin } from "@aicraft/aix/gui"
import type { Account, Settings } from "../src/contract.js"
import type { Definition } from "./definition.js"

export interface SettingsPageProps {
  readonly accounts: readonly Account[]
  readonly settings: Settings
  readonly profileOf: (account: Account) => string
  readonly onAddAccount: (label: string) => Promise<void>
  readonly onRemoveAccount: (account: Account) => Promise<void>
  readonly onImport: (account: Account) => Promise<void>
  readonly onSaveSettings: (settings: Settings) => Promise<void>
  readonly onOpenWorkbench: () => void
  readonly onOpenTemplates?: () => void
}

/** 设置页：账号、门户地址与「记住答案」的行为。 */
export function AccountSettings(props: SettingsPageProps) {
  const ctx = usePlugin<Definition>()
  const [label, setLabel] = createSignal("")
  const [address, setAddress] = createSignal(props.settings.portalUrl)
  const [busy, setBusy] = createSignal<string | null>(null)

  const add = async () => {
    const value = label().trim()
    if (value.length === 0 || busy()) return
    setBusy("add")
    try {
      await props.onAddAccount(value)
      setLabel("")
    } catch (cause) {
      failure(cause)
    } finally {
      setBusy(null)
    }
  }

  const saveAddress = async () => {
    if (busy()) return
    setBusy("address")
    try {
      await props.onSaveSettings({ ...props.settings, portalUrl: address().trim() })
      ctx.toast.show({ title: ctx.t("settings.saved"), variant: "success" })
    } catch (cause) {
      failure(cause)
    } finally {
      setBusy(null)
    }
  }

  const toggleAsk = async (checked: boolean) => {
    try {
      await props.onSaveSettings({ ...props.settings, askSaveDefaults: checked })
    } catch (cause) {
      failure(cause)
    }
  }

  const importCookies = async (account: Account) => {
    if (busy()) return
    setBusy(account.id)
    try {
      await props.onImport(account)
    } catch (cause) {
      failure(cause)
    } finally {
      setBusy(null)
    }
  }

  const failure = (cause: unknown) =>
    ctx.toast.show({
      title: ctx.t("settings.failed"),
      description: cause instanceof Error ? cause.message : String(cause),
      variant: "error",
    })

  return (
    <ctx.ui.SettingsLayout
      title={ctx.t("settings.heading")}
      description={ctx.t("settings.description")}
      actions={
        <ctx.ui.Button variant="neutral" size="small" icon="outline-arrow-left" onClick={props.onOpenWorkbench}>
          {ctx.t("common.back")}
        </ctx.ui.Button>
      }
    >
      <div class="itsm-stack">
        <section class="itsm-card">
          <header class="itsm-card__head">
            <div>
              <h3 class="itsm-card__title">{ctx.t("settings.accounts")}</h3>
              <p class="itsm-card__hint">{ctx.t("settings.accounts.hint")}</p>
            </div>
          </header>

          <Show
            when={props.accounts.length > 0}
            fallback={<p class="itsm-card__empty">{ctx.t("settings.noAccount")}</p>}
          >
            <div class="itsm-account-list">
              <For each={props.accounts}>
                {(account) => (
                  <div class="itsm-account-row">
                    <span class="itsm-account-row__icon">
                      <ctx.ui.Icon name="outline-cookie" size="small" />
                    </span>
                    <span class="itsm-account-row__text">
                      <span class="itsm-account-row__name">{account.label}</span>
                      <span class="itsm-account-row__meta">{props.profileOf(account)}</span>
                    </span>
                    <ctx.ui.Button
                      variant="neutral"
                      size="small"
                      busy={busy() === account.id}
                      onClick={() => void importCookies(account)}
                    >
                      {busy() === account.id
                        ? ctx.t("settings.account.import.busy")
                        : ctx.t("settings.account.import")}
                    </ctx.ui.Button>
                    <ctx.ui.Tooltip value={ctx.t("settings.account.remove")}>
                      <ctx.ui.IconButton
                        icon="outline-trash"
                        size="small"
                        label={ctx.t("settings.account.remove")}
                        onClick={() => void props.onRemoveAccount(account)}
                      />
                    </ctx.ui.Tooltip>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <div class="itsm-inline-form">
            <div class="itsm-inline-form__field">
              <ctx.ui.TextInput
                label={ctx.t("settings.account.name")}
                placeholder={ctx.t("settings.account.name.placeholder")}
                value={label()}
                onInput={setLabel}
                onSubmit={() => void add()}
              />
            </div>
            <ctx.ui.Button
              variant="neutral"
              size="small"
              icon="plus"
              busy={busy() === "add"}
              disabled={label().trim().length === 0}
              onClick={() => void add()}
            >
              {ctx.t("settings.account.add")}
            </ctx.ui.Button>
          </div>

          <div class="itsm-card__divider" />

          <div>
            <h3 class="itsm-card__title">{ctx.t("settings.portal")}</h3>
            <p class="itsm-card__hint">{ctx.t("settings.portal.hint")}</p>
          </div>
          <div class="itsm-inline-form">
            <div class="itsm-inline-form__field">
              <ctx.ui.TextInput
                label={ctx.t("settings.portal.url")}
                placeholder={ctx.t("settings.portal.placeholder")}
                type="url"
                value={address()}
                onInput={setAddress}
                onSubmit={() => void saveAddress()}
              />
            </div>
            <ctx.ui.Button
              variant="neutral"
              size="small"
              busy={busy() === "address"}
              onClick={() => void saveAddress()}
            >
              {ctx.t("common.save")}
            </ctx.ui.Button>
          </div>
        </section>

        <section class="itsm-card">
          <div class="itsm-switch-row">
            <div>
              <h3 class="itsm-card__title">{ctx.t("settings.answers.ask")}</h3>
              <p class="itsm-card__hint">{ctx.t("settings.answers.ask.hint")}</p>
            </div>
            <ctx.ui.Switch
              label={ctx.t("settings.answers.ask")}
              hideLabel
              checked={props.settings.askSaveDefaults}
              onChange={(checked) => void toggleAsk(checked)}
            />
          </div>

          <Show when={props.onOpenTemplates}>
            <div class="itsm-card__divider" />

            <div class="itsm-switch-row">
              <div>
                <h3 class="itsm-card__title">{ctx.t("settings.templates")}</h3>
                <p class="itsm-card__hint">{ctx.t("settings.templates.hint")}</p>
              </div>
              <ctx.ui.Button variant="neutral" size="small" onClick={() => props.onOpenTemplates?.()}>
                {ctx.t("settings.templates.manage")}
              </ctx.ui.Button>
            </div>
          </Show>
        </section>
      </div>
    </ctx.ui.SettingsLayout>
  )
}
