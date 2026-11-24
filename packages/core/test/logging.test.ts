import { describe, expect, test } from "bun:test"
import path from "path"
import { Global } from "@aicraft/util/global"
import { Logging } from "@aicraft/util/observability/logging"

describe("Logging", () => {
  test("uses a local-specific log file for local installs", () => {
    expect(Logging.file(true, "local")).toBe(path.join(Global.Path.log, "aicraft-local.log"))
  })

  test("keeps non-local installs on the default log file", () => {
    expect(Logging.file(false, "next")).toBe(path.join(Global.Path.log, "aicraft.log"))
  })
})
