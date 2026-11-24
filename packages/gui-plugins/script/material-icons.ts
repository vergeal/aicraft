/**
 * Regenerates the tree's icon sprite and file-type map from Material Icon Theme, the icon theme VS Code ships.
 * Run with `bun packages/gui-plugins/script/material-icons.ts`.
 *
 * The theme is MIT licensed (https://github.com/material-extensions/vscode-material-icon-theme). Only the icons
 * reachable from `fileNames` and `fileExtensions` are emitted: the tree renders one icon per row and gives folders a
 * two-state mark of its own, so the theme's per-folder-name icons never apply.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const VERSION = "5.40.0"
const OUT = path.join(import.meta.dir, "../src/file")
const SLOTS = ["file", "folder", "folderExpanded", "rootFolder", "rootFolderExpanded"] as const

type Theme = {
  iconDefinitions: Record<string, { iconPath: string }>
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  file: string
  folder: string
  folderExpanded: string
  rootFolder: string
  rootFolderExpanded: string
}

async function download() {
  const dir = await mkdtemp(path.join(tmpdir(), "material-icons-"))
  const tarball = path.join(dir, "theme.tgz")
  const response = await fetch(`https://registry.npmjs.org/material-icon-theme/-/material-icon-theme-${VERSION}.tgz`)

  if (!response.ok) throw new Error(`download failed: ${response.status}`)

  await writeFile(tarball, new Uint8Array(await response.arrayBuffer()))
  const unpacked = path.join(dir, "unpacked")
  await mkdir(unpacked)

  const tar = Bun.spawn(["tar", "-xzf", tarball, "-C", unpacked, "--strip-components=1"])
  await tar.exited

  return { dir, root: unpacked }
}

function innerSvg(source: string) {
  const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1] ?? "0 0 16 16"
  const body = source.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")

  return { viewBox, body }
}

/** Symbols share one document, so every id inside a symbol has to carry that symbol's name. */
function scopeIds(body: string, prefix: string) {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!)

  for (const id of ids) {
    body = body
      .replaceAll(`id="${id}"`, `id="${prefix}${id}"`)
      .replaceAll(`url(#${id})`, `url(#${prefix}${id})`)
      .replaceAll(`href="#${id}"`, `href="#${prefix}${id}"`)
  }

  return body
}

/** A few older glyphs carry their colour through `class="colorrrggbb"`, which a standalone sprite cannot resolve. */
function inlineClassColors(body: string) {
  return body.replace(/class="color([0-9a-fA-F]{6,8})\b[^"]*"/g, 'fill="#$1"')
}

/** Unfilled shapes default to black; they should follow the row's icon colour instead. */
function fillUnfilledShapes(body: string) {
  return body.replace(/<(path|circle|rect|polygon|ellipse)(\s[^>]*)?>/g, (tag, element: string, rest = "") => {
    if (/\bfill=/.test(tag)) return tag

    return `<${element}${rest} fill="currentColor">`
  })
}

/** A few Material Symbols glyphs sit on a shifted grid, such as `0 -960 960 960`; move them to a zero origin. */
function normalizeViewBox(body: string, viewBox: string) {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number)

  if (minX === 0 && minY === 0) return { viewBox, body }

  return {
    viewBox: `0 0 ${width} ${height}`,
    body: `<g transform="translate(${-minX} ${-minY})">${body}</g>`,
  }
}

const { dir, root } = await download()

const theme = JSON.parse(await readFile(path.join(root, "dist/material-icons.json"), "utf8")) as Theme

const names = new Set<string>([
  ...Object.values(theme.fileNames),
  ...Object.values(theme.fileExtensions),
  ...SLOTS.map((slot) => theme[slot]),
].filter((name) => typeof name === "string"))

const symbols: string[] = []
const viewBoxByName = new Map<string, string>()

for (const name of [...names].sort()) {
  const file = Bun.file(path.join(root, "icons", `${name}.svg`))

  if (!(await file.exists())) continue

  const { viewBox, body } = innerSvg(await file.text())
  const scoped = scopeIds(fillUnfilledShapes(inlineClassColors(body)), `mim-${name}-`)
  const normalized = normalizeViewBox(scoped, viewBox)
  viewBoxByName.set(name, normalized.viewBox)
  symbols.push(`<symbol id="mim-${name}" viewBox="${normalized.viewBox}">${normalized.body}</symbol>`)
}

// The project draws its own disclosure chevron; the theme has no equivalent slot for it.
symbols.push(
  `<symbol id="outline-chevron-right" viewBox="0 0 16 16" fill="none"><path d="M6 4.5L9.5 8L6 11.5" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/></symbol>`,
)

const entry = (name: string) => {
  const icon = `mim-${name}`
  const viewBox = viewBoxByName.get(name)

  return viewBox ? { name: icon, viewBox } : icon
}

// The theme references a few marks whose files its package does not ship; those keys fall back to the plain file
// mark instead of pointing at a symbol the sprite never defines.
const byFileName: Record<string, unknown> = {}
const byFileExtension: Record<string, unknown> = {}

for (const [key, name] of Object.entries(theme.fileNames)) {
  if (!viewBoxByName.has(name)) continue
  byFileName[key] = entry(name)
}

for (const [key, name] of Object.entries(theme.fileExtensions)) {
  if (!viewBoxByName.has(name)) continue
  byFileExtension[key] = entry(name)
}

for (const slot of SLOTS) {
  if (!viewBoxByName.has(theme[slot])) throw new Error(`missing ${slot} icon: ${theme[slot]}`)
}

await mkdir(OUT, { recursive: true })
await writeFile(
  path.join(OUT, "material-sprite.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join("")}</svg>`,
)
await writeFile(
  path.join(OUT, "material-icon-map.json"),
  JSON.stringify({ byFileName, byFileExtension, file: entry(theme.file), folder: entry(theme.folder), folderExpanded: entry(theme.folderExpanded) }),
)
await rm(dir, { recursive: true, force: true })

console.log(`material-icon-theme ${VERSION}: ${symbols.length} symbols`)
