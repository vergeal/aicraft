import { Icon, type IconProps } from "@opencode/ui/icon"
import { Toast, showToast, type ToastOptions } from "@opencode/ui/toast"
import { createEffect, type JSX } from "solid-js"
import { Predicate } from "effect"
import { useLanguage } from "@/runtime/i18n/language"
import { acknowledgeLocalStorageNotice, localStorageNoticePending } from "@/runtime/persistence/storage"

/** An icon name from the app's catalog, or the plugin's own mark as an element. */
type AppToastIcon = IconProps["name"] | JSX.Element | (() => JSX.Element)

type AppToastOptions = Omit<ToastOptions, "icon"> & {
  icon?: AppToastIcon
}

export function ToastRegion() {
  const language = useLanguage()

  // A write can fail before this region mounts, so the notice waits in storage state until shown once.
  createEffect(() => {
    if (!localStorageNoticePending()) return
    acknowledgeLocalStorageNotice()
    showAppToast({
      variant: "error",
      title: language.t("toast.storage.writeFailed.title"),
      description: language.t("toast.storage.writeFailed.description"),
    })
  })

  return <Toast.Region />
}

function showAppToast(options: AppToastOptions | string) {
  if (Predicate.isString(options)) return showToast(options)

  return showToast({
    ...options,
    icon: resolveIcon(options.icon, options.variant),
    actions: options.actions?.map((action) => ({
      ...action,
      variant: action.onClick === "dismiss" ? "secondary" : "primary",
    })),
  })
}

export { showAppToast as showToast }

function resolveIcon(icon: AppToastIcon | undefined, variant: ToastOptions["variant"]) {
  // A plugin's own mark arrives as an element; only a catalog name needs resolving.
  if (icon !== undefined && !Predicate.isString(icon)) return icon

  const name = icon ?? (variant === "success" ? "check" : undefined)

  if (!name) return undefined

  // SAFETY: Solid resolves a function child as a JSX accessor under the toast's render owner, not this imperative
  // call site, so the accessor stands in for the element.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- see SAFETY above
  return (() => <Icon name={name} />) as unknown as JSX.Element
}
