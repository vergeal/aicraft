import { useDialog } from "@aicraft/ui/context/dialog"
import { useI18n } from "@aicraft/ui/context/i18n"
import { ImagePreview } from "@aicraft/ui/image-preview"

export function createImagePreview() {
  const dialog = useDialog()
  const i18n = useI18n()

  const open = (event: MouseEvent | KeyboardEvent) => {
    const image = event.currentTarget

    if (!(image instanceof HTMLImageElement)) return
    const src = image.currentSrc || image.getAttribute("src")

    if (!src) return
    const alt = image.alt || i18n.t("ui.imagePreview.alt")
    event.preventDefault()
    event.stopPropagation()
    dialog.show(() => <ImagePreview src={src} alt={alt} origin={image} />)
  }

  const wire = (image: HTMLImageElement) => {
    image.setAttribute("role", "button")
    image.setAttribute("aria-haspopup", "dialog")
    image.setAttribute("aria-label", image.alt || i18n.t("ui.imagePreview.alt"))
    image.tabIndex = 0
    image.onclick = open
    image.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      open(event)
    }
  }

  /**
   * Pass a rendered `<img>` (as a `ref`) to wire that one image, or a container to wire the images already inside it.
   * A container scan cannot reach an image that mounts later, such as one behind a `<Show>`, which never opens.
   */
  return (target: HTMLElement) => {
    if (target instanceof HTMLImageElement) {
      wire(target)

      return
    }

    target.querySelectorAll<HTMLImageElement>("img:not([data-markdown-favicon])").forEach(wire)
  }
}
