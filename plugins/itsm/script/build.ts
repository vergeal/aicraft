import { transformSync } from "@babel/core"
import tsPreset from "@babel/preset-typescript"
import solidPreset from "babel-preset-solid"
import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const dist = join(root, "dist")
const manifest = await Bun.file(join(root, "ocplugin.json")).json()

await rm(dist, { recursive: true, force: true })
await mkdir(join(dist, "server"), { recursive: true })

const build = await Bun.build({
  entrypoints: [join(root, "server", "main.ts")],
  target: "bun",
  format: "esm",
  outdir: join(dist, "server"),
  naming: "main.js",
  // Host modules stay external so the plugin shares the host's module instances.
  external: [...manifest.externals, "node:*"],
})
if (!build.success) {
  for (const log of build.logs) console.error(log)
  process.exit(1)
}

// The GUI bundle runs in the desktop app's main process and in every window; the host resolves `@opencode/plugin/gui`
// to the main SDK in one and to the window SDK in the other. A CommonJS file is what a manifest's gui entry accepts.
await mkdir(join(dist, "gui"), { recursive: true })
const gui = await Bun.build({
  entrypoints: [join(root, "gui", "main.tsx")],
  target: "node",
  format: "cjs",
  outdir: join(dist, "gui"),
  naming: "main.js",
  external: [
    "effect",
    "@opencode/schema/rpc",
    "@opencode/plugin/gui",
    "@opencode/plugin/gui/main",
    "@opencode/plugin",
    "solid-js",
    "solid-js/web",
    "solid-js/store",
    "electron",
    "node:*",
  ],
  plugins: [
    {
      name: "solid-jsx",
      setup(build) {
        // Bun's automatic JSX runtime hands Solid already-evaluated props, so `when`/`each` lose reactivity and a
        // state change never re-renders. Compile `.tsx` with Babel's Solid preset instead: props become getters and
        // `insert` tracks the expressions inside them.
        build.onLoad({ filter: /\.tsx$/ }, async (args) => {
          const result = transformSync(await Bun.file(args.path).text(), {
            filename: args.path,
            presets: [[solidPreset, {}], [tsPreset, {}]],
            babelrc: false,
            configFile: false,
            sourceMaps: "inline",
          })
          if (!result?.code) throw new Error(`failed to compile ${args.path}`)
          return { contents: result.code, loader: "js" }
        })
      },
    },
  ],
})
if (!gui.success) {
  for (const log of gui.logs) console.error(log)
  process.exit(1)
}

for (const item of ["skills", "ocplugin.json", "README.md"]) {
  await cp(join(root, item), join(dist, item), { recursive: true }).catch(() => undefined)
}

// The unpacked bundle is a plugin directory, so its manifest names the plugin id and points at the built entry.
await writeFile(
  join(dist, "package.json"),
  JSON.stringify(
    {
      name: manifest.id,
      version: manifest.version,
      type: "module",
      license: "MIT",
      main: "./server/main.js",
      exports: { ".": "./server/main.js" },
    },
    null,
    2,
  ) + "\n",
)

console.log(`built ${manifest.id} ${manifest.version} into ${dist}`)
