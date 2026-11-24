export * as SkillPackage from "./skill-package.js"

import { AbsolutePath } from "@aicraft/schema/schema"
import { Catalog } from "@aicraft/schema/catalog"
import { optional } from "@aicraft/schema/schema"
import { Skill } from "@aicraft/schema/skill"
import { Schema } from "effect"
import matter from "gray-matter"

/**
 * The frontmatter a skill package carries: the copy the market lists, the icon its tile paints, and the client-owned
 * category its shelf is grouped under. A category outside the client's list fails the decode, so a package author
 * learns about the typo instead of landing in a shelf nobody asked for.
 */
export interface Frontmatter extends Schema.Schema.Type<typeof Frontmatter> {}
export const Frontmatter = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  icon: optional(Schema.NullOr(Schema.String)),
  category: optional(Catalog.Category),
})

/**
 * A skill package is the unit the skill market publishes: one `SKILL.md` whose frontmatter carries the name, the
 * description and the icon, followed by the body an agent loads. A built-in skill declares the same package and is
 * read the same way, so its icon and copy come from the package instead of from the code that registers it.
 */
export function read(id: string, markdown: string): Skill.Info {
  const parsed = matter(markdown)
  const frontmatter = Schema.decodeUnknownSync(Frontmatter)(parsed.data)
  const icon = frontmatter.icon?.trim()
  return Skill.Info.make({
    id: Skill.ID.make(id),
    name: Skill.Name.make(frontmatter.name),
    description: frontmatter.description,
    ...(icon ? { icon } : {}),
    ...(frontmatter.category ? { category: frontmatter.category } : {}),
    path: AbsolutePath.make(`skill://${id}/SKILL.md`),
    content: parsed.content,
  })
}

/** Writes a package whose body is assembled at runtime, then reads it back so it follows the same path. */
export function define(input: { id: string; frontmatter: Frontmatter; body: string }): Skill.Info {
  // JSON is valid YAML, and it drops the keys a caller left undefined, so the written frontmatter stays a single line.
  return read(input.id, `---\n${JSON.stringify(input.frontmatter)}\n---\n\n${input.body}`)
}
