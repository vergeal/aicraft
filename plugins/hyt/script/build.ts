import { transformSync } from "@babel/core"
import tsPreset from "@babel/preset-typescript"
import solidPreset from "babel-preset-solid"
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises"
import { existsSync, readdirSync } from "node:fs"
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
  // `@opencode/schema/rpc` is the contract's runtime; the window host shares it with the bundle.
  external: [
    "effect",
    "@opencode/schema/rpc",
    "@opencode/plugin/gui",
    "@opencode/plugin/gui/main",
    "@opencode/plugin",
    "solid-js",
    "solid-js/web",
    "solid-js/store",
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

// SKILL.md is read at activation, so the text travels with the bundle instead of being inlined. The knowledge
// and style standards ship with the bundle so a user can read the rules the plugin applies.
for (const item of [
  "skills",
  "ocplugin.json",
  "README.md",
  "src/knowledge/README.md",
  "src/style/README.md",
  "src/profile/README.md",
]) {
  await cp(join(root, item), join(dist, item), { recursive: true }).catch(() => undefined)
}

// 插件自带原生桥接：不启动虹云通客户端也能收发消息。二进制按平台放进 native/<platform>-<arch>/，
// macOS 还要带上 ECMediaSDK.framework，并把查找路径改成相对可执行文件。
const nativeName = process.platform === "win32" ? "hyt-native-bridge.exe" : "hyt-native-bridge"
const nativeBinary = [
  join(root, "native", "build", "bin", nativeName),
  join(root, "native", "build-win", "bin", "Release", nativeName),
  join(root, "native", "build-win", "Release", nativeName),
  join(root, "native", "build-win", "bin", nativeName),
].find((candidate) => existsSync(candidate))

if (nativeBinary === undefined) {
  console.warn(
    `native bridge missing: build it first (native/scripts/build-${process.platform === "win32" ? "windows" : "macos"})`,
  )
} else {
  const nativeDir = join(dist, "native", `${process.platform}-${process.arch}`)
  await mkdir(nativeDir, { recursive: true })
  await cp(nativeBinary, join(nativeDir, nativeName))
  await chmod(join(nativeDir, nativeName), 0o755)
  if (process.platform === "darwin") await shipMacFramework(join(nativeDir, nativeName))
  if (process.platform === "win32") await shipWindowsRuntime(nativeDir)
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

/**
 * macOS 的桥接动态链接 ECMediaSDK.framework，原本的 rpath 指向开发机的 SDK 目录。
 * 把 framework 一起放进产物，并加一条相对可执行文件的查找路径，换机器也能加载。
 */
async function shipMacFramework(executable: string) {
  const sdkRoot = process.env.HYT_SDK_ROOT?.trim() ?? ""
  const source = [
    sdkRoot.length > 0 ? join(sdkRoot, "lib", "mac", "ECMediaSDK.framework") : "",
    join(root, "native", "sdk-runtime", "ECMediaSDK.framework"),
  ].find((candidate) => candidate.length > 0 && existsSync(candidate))
  if (source === undefined) {
    console.warn("ECMediaSDK.framework not found; the bridge will only run on the machine that built it")
    return
  }

  const target = join(dist, "native", "Frameworks", "ECMediaSDK.framework")
  await cp(source, target, { recursive: true })
  // native/<platform-arch>/../Frameworks
  const add = Bun.spawnSync([
    "install_name_tool",
    "-add_rpath",
    "@executable_path/../Frameworks",
    executable,
  ])
  if (add.exitCode !== 0) console.warn(`install_name_tool failed: ${add.stderr.toString()}`)
}

/** Windows 桥接依赖 SDK 的 DLL；放在 exe 旁边就能被系统优先加载。 */
async function shipWindowsRuntime(target: string) {
  const sdkRoot = process.env.HYT_SDK_ROOT?.trim() ?? ""
  const directories = [
    sdkRoot.length > 0 ? join(sdkRoot, "lib", "win") : "",
    sdkRoot.length > 0 ? join(sdkRoot, "libSdk") : "",
    join(root, "native", "sdk-runtime", "win"),
  ].filter((directory) => directory.length > 0 && existsSync(directory))
  for (const directory of directories) {
    for (const entry of readdirSync(directory)) {
      if (!entry.toLowerCase().endsWith(".dll")) continue
      await cp(join(directory, entry), join(target, entry))
    }
  }
}

