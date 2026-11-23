#!/usr/bin/env bun
import { mkdir, rm, symlink } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * 开发期的安装链路：构建后把 `dist` 铺进安装目录，宿主依赖在安装目录里各软链一个包。
 *
 * 入口必须是真实拷贝：宿主按安装目录里文件的内容变化重载 GUI（`PluginModule` watch 的就是那个
 * 路径），指向仓库的软链不会把变更事件送到那里。
 *
 * `node_modules` 本身也必须是真实目录，只软链里面的每个包：bun 从 `server/main.js` 向上找依赖时
 * 不跟随整个 `node_modules` 的软链，会报 `Cannot find package '@opencode/schema'`。
 * 缺了依赖，服务加载插件就失败，GUI 也就拿不到 state。
 *
 * `rsync --exclude` 同时保护接收端，所以 `--delete` 不会把这些软链冲掉。
 *
 * 安装目录改名或换数据目录时用 `HYT_INSTALL_DIR` 覆盖。
 */
const plugin = join(import.meta.dir, "..")
const target = process.env.HYT_INSTALL_DIR ?? join(homedir(), ".opencode", "exc", "changhong.hyt")
const dependencies = ["@opencode/plugin", "@opencode/schema", "effect"]

const build = await Bun.spawn(["bun", "run", "script/build.ts"], { cwd: plugin, stdout: "inherit" }).exited
if (build !== 0) process.exit(build)

await mkdir(target, { recursive: true })
const sync = await Bun.spawn(["rsync", "-a", "--delete", "--exclude", "node_modules", join(plugin, "dist") + "/", target + "/"], {
  stdout: "inherit",
  stderr: "inherit",
}).exited
if (sync !== 0) process.exit(sync)

const modules = join(target, "node_modules")
await rm(modules, { force: true, recursive: true })
await mkdir(modules, { recursive: true })

for (const name of dependencies) {
  // 从插件目录解析到入口文件，再回退到声明该包名的目录：软链要指向包本身，`import` 才读得到它的 package.json。
  const resolved = Bun.resolveSync(name, plugin)
  const root = packageRoot(resolved.startsWith("file:") ? Bun.fileURLToPath(resolved) : resolved, name)
  await mkdir(join(modules, name, ".."), { recursive: true })
  await symlink(root, join(modules, name), "dir")
}

console.log(`linked ${target} with ${dependencies.length} host packages`)

function packageRoot(entry: string, name: string) {
  for (let dir = join(entry, ".."); dir.length > 1; dir = join(dir, "..")) {
    const manifest = join(dir, "package.json")
    if (!existsSync(manifest)) continue
    if (JSON.parse(readFileSync(manifest, "utf8")).name === name) return dir
  }
  throw new Error(`no package.json declaring ${name} above ${entry}`)
}
