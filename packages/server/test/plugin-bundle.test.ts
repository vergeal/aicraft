import { expect } from "bun:test"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Schedule } from "effect"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

/** A temp home for one server, installed as AICRAFT_TEST_HOME so discovery reads its install root from here. */
function isolatedHome() {
  return Effect.gen(function* () {
    const home = path.join(os.tmpdir(), `oc-bundle-${crypto.randomUUID()}`)
    const previous = process.env.AICRAFT_TEST_HOME
    process.env.AICRAFT_TEST_HOME = home
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.AICRAFT_TEST_HOME
        else process.env.AICRAFT_TEST_HOME = previous
      }),
    )
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(home, { recursive: true, force: true })))
    return home
  })
}

const server = (input?: { readonly filewatcher?: boolean }) =>
  Effect.gen(function* () {
    const handler = yield* ServerFetch.make({
      app: { version: "test" },
      database: { path: ":memory:" },
      fs: { filewatcher: input?.filewatcher ?? false },
      models: { fetch: false },
      config: { content: "{}" },
    })
    return (pathname: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(`http://aicraft.local${pathname}`, init)))
  })

const listedIds = (request: (pathname: string, init?: RequestInit) => Effect.Effect<Response, unknown>) =>
  Effect.gen(function* () {
    const response = yield* request("/api/plugin")
    const body = (yield* Effect.promise(() => response.json())) as { data: ReadonlyArray<{ id: string }> }
    return body.data.map((plugin) => plugin.id)
  })

// A regression for the EPERM install failure: discovery once saw the staging directory inside the watched install
// root, loaded it, and its open handles failed the final rename on Windows.
it.live(
  "installs a bundle whose staging never lands in the watched install root",
  () =>
    Effect.gen(function* () {
      const home = yield* isolatedHome()
      const id = "test.bundled"
      const directory = path.join(home, ".distribution", "plugins", id, "1.0.0")
      yield* Effect.promise(async () => {
        await mkdir(directory, { recursive: true })
        const archive = new Bun.Archive({
          METAINF: JSON.stringify({ apiVersion: 1, id, version: "1.0.0", entry: { server: "server/main" } }),
          "server/main.js": `export default { id: ${JSON.stringify(id)}, setup() {} }`,
        })
        await Bun.write(path.join(directory, "bundle.exc"), await archive.bytes())
      })
      // The real watcher, like the desktop app: the install must settle through the same event feed a reload uses.
      const request = yield* server({ filewatcher: true })

      const response = yield* request("/api/experimental/plugin/bundle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
      expect(response.status).toBe(200)
      const installed = (yield* Effect.promise(() => response.json())) as {
        data: { id: string; version: string; path: string }
      }
      expect(installed.data).toMatchObject({ id, version: "1.0.0" })
      // The watched root holds only the finished plugin; staging lived beside it and kept nothing behind.
      expect(yield* Effect.promise(() => readdir(path.join(home, ".aicraft", "exc")))).toEqual([id])
      expect(yield* Effect.promise(() => readdir(path.join(home, ".aicraft", "exc-staging")))).toEqual([])
      // Install settles with the plugin activated, so the same response already shows in the inventory.
      expect(yield* listedIds(request)).toContain(id)
    }),
  12_000,
)

it.live("skips dot-prefixed directories left under the install root", () =>
  Effect.gen(function* () {
    const home = yield* isolatedHome()
    const exc = path.join(home, ".aicraft", "exc")
    // A staging-style leftover and a control plugin: discovery must list the control and never touch the dot entry.
    const write = async (directory: string, id: string) => {
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: id, type: "module" }))
      await writeFile(path.join(directory, "index.js"), `export default { id: ${JSON.stringify(id)}, setup() {} }`)
    }
    yield* Effect.promise(() =>
      Promise.all([write(path.join(exc, ".test.stale.tmp-left"), "test.stale"), write(path.join(exc, "test.control"), "test.control")]),
    )
    const request = yield* server()

    // Activation is asynchronous: wait for the control to appear, then the leftover must be absent.
    const ready = yield* listedIds(request).pipe(
      Effect.flatMap((ids) => (ids.includes("test.control") ? Effect.succeed(ids) : Effect.fail("pending"))),
      Effect.retry({ times: 100, schedule: Schedule.spaced("50 millis") }),
      Effect.orElseSucceed(() => [] as string[]),
    )
    expect(ready).toContain("test.control")
    expect(ready).not.toContain("test.stale")
  }),
)
