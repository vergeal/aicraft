import { parsePathLineSuffix } from "@aicraft/util/path"
import type { Files, LineRange } from "@aicraft/plugin/gui"

export type ParsedFileLink = {
  /** The normalized path: absolute, or relative with any leading `../` kept. */
  readonly path: string
  readonly selection?: LineRange
}

/**
 * Extracts a normalized file path and optional 1-based line range from a markdown link or inline-code token.
 * Supports `:line`, `:line:col`, `:start-end`, `#Lstart`, and `#Lstart-Lend`.
 */
export function parseFileLink(href: string): ParsedFileLink {
  const raw = href.trim().replaceAll("\\", "/")
  const isFileUrl = /^file:\/\//i.test(raw)
  const extracted = extractLineSelection(raw, isFileUrl)

  return { path: normalizeRelativeSegments(extracted.path, isFileUrl), selection: extracted.selection }
}

export function isAbsoluteLink(path: string) {
  return /^skill:\/\//i.test(path) || /^[a-z]:\//i.test(path) || path.startsWith("/")
}

/**
 * The one workspace file a relative path names: the literal path when it exists, else the file whose path ends with it
 * with the fewest directories in front of the linked name. A link is written relative to the project root, so that
 * shallowest match is the file it meant; clicking a link opens it instead of dropping the user in a file search.
 */
export async function findFileLink(input: {
  readonly files: Pick<Files, "search">
  readonly path: string
  readonly signal: AbortSignal
}): Promise<string | undefined> {
  const query = input.path.replace(/^(?:\.\.\/)+/, "")

  if (!query) return

  const results = await input.files.search(query, { limit: 200, signal: input.signal }).catch(() => [])
  const matches = [...new Set(results)].filter((file) => file === query || file.endsWith(`/${query}`))

  return matches.sort(shallowest)[0]
}

/** Equal depth sorts by path, so the choice never depends on the order the search index returned its hits in. */
function shallowest(a: string, b: string) {
  const depth = a.split("/").length - b.split("/").length

  return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0
}

/**
 * Whether a path named in a message is a file, without reading it: absolute paths by listing their directory,
 * workspace paths by the search index.
 */
export async function checkFileLinkExists(input: {
  readonly files: Pick<Files, "search" | "resolve" | "exists">
  readonly href: string
  readonly signal: AbortSignal
}): Promise<boolean> {
  const parsed = parseFileLink(input.href)

  // `~` is the server's home folder, which the app cannot expand. A network share (`//host/share`) would make the
  // server connect to the host just to answer.
  if (!parsed.path || parsed.path.startsWith("~") || parsed.path.startsWith("//")) return false

  if (isAbsoluteLink(parsed.path)) return input.files.exists(input.files.resolve(parsed.path))

  return !!(await findFileLink({ files: input.files, path: parsed.path, signal: input.signal }))
}

function extractLineSelection(input: string, isFileUrl: boolean) {
  const parsed = parsePathLineSuffix(input)

  if (parsed.selection || parsed.path !== input) {
    const path = isFileUrl ? (parsed.path.split("?", 1)[0] ?? "") : parsed.path

    return { path, selection: parsed.selection }
  }

  if (!isFileUrl) return { path: input, selection: undefined }

  const withoutFragment = input.replace(/(\.[a-z0-9]+)#[^/.]*$/i, "$1")
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? ""

  return parsePathLineSuffix(withoutQuery)
}

function normalizeRelativeSegments(input: string, decode: boolean): string {
  const fileHost = /^file:\/\/(?!(?:localhost)?\/)([^/]+\/.*)$/i.exec(input)

  const withoutProtocol = fileHost
    ? `//${fileHost[1]}`
    : input.replace(/^file:\/\/(?:localhost)?/i, "").replace(/^\/([a-z]:\/)/i, "$1")

  const decoded = decode ? decodePathSafely(withoutProtocol) : withoutProtocol
  const trimmed = decoded.replace(/^\.\//, "").replace(/\/+$/, "")

  if (!trimmed) return ""

  const skill = /^skill:\/\//i.test(trimmed)
  const unc = !skill && trimmed.startsWith("//")
  const driveMatch = trimmed.match(/^([a-z]:)\/(.*)$/i)
  const prefix = skill ? "skill://" : unc ? "//" : driveMatch ? `${driveMatch[1]}/` : trimmed.startsWith("/") ? "/" : ""

  const rest = skill
    ? trimmed.slice("skill://".length)
    : unc
      ? trimmed.slice(2)
      : driveMatch
        ? (driveMatch[2] ?? "")
        : prefix
          ? trimmed.slice(1)
          : trimmed

  const out = rest.split("/").reduce<string[]>((acc, part) => {
    if (!part || part === ".") return acc

    if (part === "..") {
      if (acc.length > 0 && acc.at(-1) !== "..") {
        acc.pop()

        return acc
      }

      if (!prefix) acc.push("..")

      return acc
    }

    acc.push(part)

    return acc
  }, [])

  return `${prefix}${out.join("/")}`
}

function decodePathSafely(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
