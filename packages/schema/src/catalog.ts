export * as Catalog from "./catalog.js"

import { Schema } from "effect"

/**
 * The shelves the product files plugins and skills under. The client owns this list: discovery refuses an entry whose
 * manifest or `SKILL.md` names anything else, so every heading in the library has copy the product ships instead of a
 * value an author made up.
 */
export const Categories = ["automation", "productivity", "design", "developer-tools", "data"] as const

export type Category = (typeof Categories)[number]

export const Category = Schema.Literals(Categories).annotate({
  identifier: "Catalog.Category",
  description: "Where a plugin or skill belongs in the catalog.",
})

/** Whether a declared value is one of the client's categories; anything else is not loaded. */
export const isCategory = (input: unknown): input is Category =>
  typeof input === "string" && Categories.some((category) => category === input)
