import { expect, test } from "bun:test"
import { Env } from "../src/env"

test("session environment omits server credentials", () => {
  const previousPassword = process.env.AICRAFT_PASSWORD
  const previousLegacyPassword = process.env.AICRAFT_SERVER_PASSWORD
  const previousValue = process.env.AICRAFT_SESSION_ENV_TEST
  process.env.AICRAFT_PASSWORD = "password"
  process.env.AICRAFT_SERVER_PASSWORD = "legacy"
  process.env.AICRAFT_SESSION_ENV_TEST = "included"

  const environment = Env.session()

  if (previousPassword === undefined) delete process.env.AICRAFT_PASSWORD
  else process.env.AICRAFT_PASSWORD = previousPassword
  if (previousLegacyPassword === undefined) delete process.env.AICRAFT_SERVER_PASSWORD
  else process.env.AICRAFT_SERVER_PASSWORD = previousLegacyPassword
  if (previousValue === undefined) delete process.env.AICRAFT_SESSION_ENV_TEST
  else process.env.AICRAFT_SESSION_ENV_TEST = previousValue

  expect(environment.AICRAFT_PASSWORD).toBeUndefined()
  expect(environment.AICRAFT_SERVER_PASSWORD).toBeUndefined()
  expect(environment.AICRAFT_SESSION_ENV_TEST).toBe("included")
})
