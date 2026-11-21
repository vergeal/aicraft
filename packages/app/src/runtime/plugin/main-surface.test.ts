import { expect, test } from "bun:test"
import type { MainSurface } from "@opencode/plugin/gui"
import { findMainSurface, mainSurfaceEntries, mainSurfacePath, type MainSurfaceEntry } from "./main-surface"

const surface = (id: string, fields: Partial<MainSurface> = {}): MainSurface => ({
  id,
  title: id,
  icon: "rail-compass",
  render: () => null,
  ...fields,
})

const entry = (plugin: string, id: string, fields: Partial<MainSurface> = {}): MainSurfaceEntry => ({
  plugin,
  value: surface(id, fields),
})

test("lists surfaces by ascending order, ties keeping contribution order, and leaves hidden ones out", () => {
  const items = [
    entry("b", "second", { order: 2 }),
    entry("a", "hidden", { hidden: true }),
    entry("a", "first", { order: -1 }),
    entry("c", "default"),
    entry("d", "another"),
  ]

  expect(mainSurfaceEntries(items).map((item) => item.value.id)).toEqual(["first", "default", "another", "second"])
})

test("builds an address a route segment keeps whole", () => {
  expect(mainSurfacePath("acme", "overview")).toBe("/plugins/acme/overview")
  expect(mainSurfacePath("@acme/ops", "over view")).toBe("/plugins/%40acme%2Fops/over%20view")
})

test("finds a surface by its plugin and id, so two plugins may use one id", () => {
  const items = [entry("a", "overview"), entry("b", "overview")]

  expect(findMainSurface(items, "b", "overview")?.plugin).toBe("b")
  expect(findMainSurface(items, "a", "missing")).toBeUndefined()
})
