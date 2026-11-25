export type FontOption = {
  family: string
  /** The family advances every glyph by the same width, so it suits code and the terminal. */
  monospace: boolean
}

/** One installed face. The Local Font Access global is not in the DOM lib yet, so the window is declared here. */
interface LocalFontData {
  readonly family: string
  readonly fullName: string
  readonly postscriptName: string
  readonly style: string
}

declare global {
  interface Window {
    queryLocalFonts?(): Promise<LocalFontData[]>
  }
}

/**
 * The families installed on this machine. The app ships no font file, so these are the picker's choices. The
 * desktop platform enumerates them through Chromium's Local Font Access API (`local-fonts` permission, granted
 * in the main process); the web build has no platform list and queries the API directly, which needs a secure
 * context and can reject when the prompt is dismissed: an empty list lets the picker fall back to the default
 * row alone.
 */
export async function systemFontFamilies(listSystemFonts?: () => Promise<readonly string[]>) {
  if (typeof window === "undefined") return []

  const families = new Set<string>()

  if (listSystemFonts) {
    const names = await listSystemFonts().catch((): readonly string[] => [])

    for (const family of names) families.add(family)
  } else {
    for (const face of (await window.queryLocalFonts?.().catch(() => [])) ?? []) families.add(face.family)
  }

  return [...families].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}

/** Whether a stored family outside {@link bundledFonts} advances narrow and wide glyphs by the same width. */
export function isMonospace(family: string) {
  const context = measureContext()

  if (!context) return /mono/i.test(family)

  context.font = `16px ${quoteFamily(family)}`

  const narrow = context.measureText("iiiiiiiiii").width
  const wide = context.measureText("WWWWWWWWWW").width

  return Math.abs(narrow - wide) < 0.5
}

let context: CanvasRenderingContext2D | null | undefined

function measureContext() {
  if (context !== undefined) return context

  if (typeof document === "undefined") return (context = null)

  context = document.createElement("canvas").getContext("2d")

  return context
}

export function quoteFamily(family: string) {
  if (/^[A-Za-z_][\w-]*$/.test(family)) return family

  return `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}
