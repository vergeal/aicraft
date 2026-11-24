import { expect, test } from "bun:test"
import { selectTheme, selectThemeMode, supportsThemeMode, themeModes } from "@aicraft/theme/tui"
import { getAicraftTheme } from "../../../src/theme"

test("selects complete light and dark themes independently", () => {
  const light = selectTheme(getAicraftTheme(), "light")
  const dark = selectTheme(getAicraftTheme(), "dark")
  expect(selectTheme(getAicraftTheme())).toEqual(light)
  expect(light.hue).toEqual(getAicraftTheme().light.hue)
  expect(dark.text).toEqual(getAicraftTheme().base.text)
  expect(dark.hue).toEqual(getAicraftTheme().dark.hue)
  expect(selectThemeMode(getAicraftTheme(), "dark")).toEqual({ theme: dark, mode: "dark" })
})

test("selects the available mode when the requested mode is missing", () => {
  const lightOnly = { base: getAicraftTheme().base, light: getAicraftTheme().light } as const
  const darkOnly = { base: getAicraftTheme().base, dark: getAicraftTheme().dark } as const

  expect(themeModes(lightOnly)).toEqual(["light"])
  expect(themeModes(darkOnly)).toEqual(["dark"])
  expect(supportsThemeMode(lightOnly, "light")).toBeTrue()
  expect(supportsThemeMode(lightOnly, "dark")).toBeFalse()
  expect(selectThemeMode(lightOnly, "dark")).toEqual({ theme: selectTheme(getAicraftTheme(), "light"), mode: "light" })
  expect(selectThemeMode(darkOnly, "light")).toEqual({ theme: selectTheme(getAicraftTheme(), "dark"), mode: "dark" })
})
