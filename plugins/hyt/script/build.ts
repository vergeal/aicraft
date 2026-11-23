import { transformSync } from "@babel/core"
import tsPreset from "@babel/preset-typescript"
import solidPreset from "babel-preset-solid"
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const dist = join(root, "dist")
const manifest = await Bun.file(join(root, "METAINF")).json()

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
            presets: [
              [solidPreset, {}],
              [tsPreset, {}],
            ],
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
  "METAINF",
  "README.md",
  "src/knowledge/README.md",
  "src/style/README.md",
  "src/profile/README.md",
]) {
  await cp(join(root, item), join(dist, item), { recursive: true }).catch(() => undefined)
}

// 插件自带原生桥接：不启动虹云通客户端也能收发消息。二进制与 SDK 运行库都随仓库分发
// （native/prebuilt 放各平台可执行文件，native/sdk 放构建所需的 SDK 头文件与库），
// 所以换机器打包只需要仓库本身，不再依赖开发机的 HYT_SDK_ROOT。
// 目标布局与 src/bridge/native.ts 的查找顺序一致：native/<platform>-<arch>/hyt-native-bridge，
// macOS 的 ECMediaSDK.framework 放在 native/Frameworks（可执行文件的 ../Frameworks）。
await shipNative(join(dist, "native"))

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
 * 把 `native/prebuilt/<platform>-<arch>/` 里的可执行文件逐个搬进产物，并补上运行库。
 * 一个 `.exc` 因此可以同时带 macOS 与 Windows 的桥接，安装时按运行时平台取用。
 */
async function shipNative(target: string) {
  const prebuilt = join(root, "native", "prebuilt")
  if (!existsSync(prebuilt)) {
    console.warn("native bridge missing: build it first (native/scripts/build-macos.sh or build-windows.bat)")
    return
  }
  const shipped: string[] = []
  for (const entry of await readdir(prebuilt, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    shipped.push(entry.name)
    const directory = join(target, entry.name)
    const executable = join(directory, nameFor(entry.name))
    await cp(join(prebuilt, entry.name), directory, { recursive: true })

    // 开发时重新编译过就用地板上的新产物；否则用入库的那份，避免旧的 build 目录把它顶回去。
    const built = entry.name === `${process.platform}-${process.arch}` ? localBuild(executable) : undefined
    if (built !== undefined) {
      await cp(built, executable)
      await chmod(executable, 0o755)
    }
    if (entry.name.startsWith("darwin")) await shipMacFramework(executable)
    if (entry.name.startsWith("win32")) await shipWindowsRuntime(directory)
  }
  if (!shipped.some((platform) => platform.startsWith("win32")))
    console.warn(
      "Windows bridge missing: run native/scripts/build-windows.bat on a Windows machine; without it the bundle has no win32 executable",
    )
}

function nameFor(platform: string) {
  return platform.startsWith("win32") ? "hyt-native-bridge.exe" : "hyt-native-bridge"
}

/** 本机重新编译出的二进制，且比入库产物新时才返回。 */
function localBuild(shipped: string) {
  const name = nameFor(`${process.platform}-${process.arch}`)
  const built = [
    join(root, "native", "build", "bin", name),
    join(root, "native", "build-win", "bin", "Release", name),
    join(root, "native", "build-win", "Release", name),
    join(root, "native", "build-win", "bin", name),
  ].find((candidate) => existsSync(candidate))
  if (built === undefined) return undefined
  return statSync(built).mtimeMs > statSync(shipped).mtimeMs ? built : undefined
}

/**
 * macOS 的桥接动态链接 ECMediaSDK.framework。把 framework 一起放进产物，
 * 并加一条相对可执行文件的查找路径，换机器也能加载。
 */
async function shipMacFramework(executable: string) {
  const sdkRoot = process.env.HYT_SDK_ROOT?.trim() ?? ""
  const source = [
    sdkRoot.length > 0 ? join(sdkRoot, "lib", "mac", "ECMediaSDK.framework") : "",
    join(root, "native", "sdk", "lib", "mac", "ECMediaSDK.framework"),
    join(root, "native", "sdk-runtime", "ECMediaSDK.framework"),
  ].find((candidate) => candidate.length > 0 && existsSync(candidate))
  if (source === undefined) {
    console.warn("ECMediaSDK.framework not found; the bridge will only run on the machine that built it")
    return
  }

  await cp(source, join(dist, "native", "Frameworks", "ECMediaSDK.framework"), { recursive: true })
  // 打包可以在别的平台进行（一个 .exc 同时带 macOS 与 Windows 桥接），但 rpath 只能由 macOS 的
  // install_name_tool / otool 修改；其他平台上复制完 framework 就结束。
  if (process.platform !== "darwin") return
  // native/<platform-arch>/../Frameworks
  const rpath = "@executable_path/../Frameworks"
  // 入库的二进制已经补过这条 rpath，重复添加会多出一条无效记录。
  if (Bun.spawnSync(["otool", "-l", executable]).stdout.toString().includes(`path ${rpath}`)) return
  const add = Bun.spawnSync(["install_name_tool", "-add_rpath", rpath, executable])
  if (add.exitCode !== 0) console.warn(`install_name_tool failed: ${add.stderr.toString()}`)
}

/** Windows 桥接依赖 SDK 的 DLL；放在 exe 旁边就能被系统优先加载。 */
async function shipWindowsRuntime(target: string) {
  const sdkRoot = process.env.HYT_SDK_ROOT?.trim() ?? ""
  const directories = [
    sdkRoot.length > 0 ? join(sdkRoot, "lib", "win") : "",
    sdkRoot.length > 0 ? join(sdkRoot, "libSdk") : "",
    join(root, "native", "sdk", "lib", "win"),
    join(root, "native", "sdk-runtime", "win"),
  ].filter((directory) => directory.length > 0 && existsSync(directory))
  for (const directory of directories) {
    for (const entry of readdirSync(directory)) {
      if (!entry.toLowerCase().endsWith(".dll")) continue
      await cp(join(directory, entry), join(target, entry))
    }
  }
}
