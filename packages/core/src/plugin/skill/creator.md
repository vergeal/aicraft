<!--
  内置技能。名称和描述在代码中注册于
  packages/core/src/plugin/skill.ts。下面的正文成为技能的
  内容。
-->

# 创建 AI Craft 插件

当用户要求新建一个 AI Craft 插件，或把一组能力打包成可安装的 `.exc` 时使用本技能。你的产出是一个能构建、能打包、能装进客户端的完整工程，而不是几段示例代码。

仓库里的 `docs/exc-dev/index.html` 是 `.exc` 格式（`apiVersion: 1`）的权威手册。本技能覆盖从零到可安装的主路径；遇到本技能没写到的细节，先查那份手册，不要凭猜测补字段。

## 工作流

1. 先确认插件的边界：它要提供什么能力、要不要界面、要不要随包技能、要不要 Python 依赖。
2. 确定身份：插件 `id`（反向域名式，如 `acme.notes`）、显示名、一句话描述、输出目录。
3. 按「工程骨架」创建文件，写清单与服务端入口。
4. 按「图标」一节生成 `display.icon`。
5. 安装依赖并构建：`bun install`，再 `bun run build`。
6. 打包：`bun run pack`，得到 `~/.distribution/plugins/<id>/<version>/<id>-<version>.exc`。
7. 交付前跑「自检清单」，逐项确认。

默认把工程建在用户指定目录；没有指定时，在当前工作区下建一个与插件 id 同名的目录。不要改动仓库里的其它插件。

## 工程骨架

```
<plugin-dir>/
├── METAINF                 # 必需：插件清单
├── package.json            # 必需：工程依赖与脚本
├── tsconfig.json           # 推荐
├── vite.config.ts          # 仅当有界面
├── server/
│   └── main.ts             # 必需：服务端入口
├── gui/
│   └── main.tsx            # 可选：界面入口（构建成 gui/main.cjs）
├── skills/
│   └── <skill-id>/
│       └── SKILL.md        # 可选：随包技能正文
├── script/
│   ├── build.ts            # 必需：构建脚本
│   └── pack.ts             # 必需：打包脚本
└── dist/                   # 构建产物，不提交
```

入口只有一条规则，以 `METAINF` 的 `entry` 为唯一权威：

- 路径相对插件根目录、不含扩展名、以 `/main` 结尾，例如 `server/main`。
- 每个部件用自己的目录，目录名 = 入口名：`server/`、`gui/`、`tui/`、`rpc/`。
- `server` / `rpc` / `tui` 的扩展名按 `.ts → .tsx → .js → .mjs` 查找。
- `gui` 只接受 CommonJS 产物（`.js` / `.cjs`）；TS 源码与 ESM 都不能作为界面入口。
- 不要依赖旧路径回退（`server/index`、`src/index`、`index`、`gui/index`、`gui-experimental`）：能加载，但每次都会打 deprecation 警告。

## METAINF

```json
{
  "apiVersion": 1,
  "id": "acme.notes",
  "version": "0.1.0",
  "requires": { "opencode": "^2.2.0" },
  "entry": {
    "server": "server/main",
    "gui": "gui/main"
  },
  "externals": ["effect", "@opencode/plugin", "@opencode/schema", "@opencode/schema/plugin-manifest"],
  "display": {
    "name": "Acme Notes",
    "description": "把项目笔记收进一个可搜索的面板。",
    "category": "productivity",
    "tools": ["acme.notes.*"],
    "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\">…</svg>"
  },
  "skills": [
    {
      "id": "acme-notes",
      "name": "Acme 笔记",
      "description": "用 acme.notes 工具读写项目笔记。",
      "path": "skills/acme-notes/SKILL.md"
    }
  ],
  "assets": []
}
```

字段要点：

- `apiVersion` 当前只接受 `1`。
- `id` 同时是安装目录名。不能与内置插件 id 相同或前缀交叉。
- `requires.opencode` 只做最低版本判断：`^2.2.0` 等价于 `>= 2.2.0`，没有上界。
- `entry.server` 必需。只有声明了 `entry.gui`，界面才会被加载。
- `externals` 由宿主提供、不被打进产物；安装时软链到插件的 `node_modules`。服务端入口至少列 `effect`、`@opencode/plugin`、`@opencode/schema`，用到清单校验再列 `@opencode/schema/plugin-manifest`。
- `display.name` 与 `display.description` 必填（安装时会校验）。
- `display.tools` 是展示用的工具名前缀，如 `acme.notes.*`。
- `display.icon` 是可选的内联 SVG 字符串，规则见「图标」。
- `skills[].path` 必须指向包内真实存在的文件；技能不会自动注册，仍要在 `activate` 里调用 `ctx.skill.transform`。
- `files` 由打包脚本写入 `{ path, sha256 }[]`，不要手写。

Python 运行时用 `runtime` 字段（本技能默认不生成）：

```json
"runtime": { "python": ">=3.10", "dependencies": ["pymysql>=1.0"] }
```

## server/main.ts

默认导出 `Plugin.define`，`id` 必须与清单一致。`activate` 在每次加载时执行。

```ts
import { Plugin } from "@opencode/plugin"
import { PluginManifest } from "@opencode/schema/plugin-manifest"
import { Schema } from "effect"

const manifest = PluginManifest.decode(
  await Bun.file(new URL("../METAINF", import.meta.url)).json(),
)

export default Plugin.define({
  id: manifest.id,
  // 发现页读 METAINF.display；已安装页读这里的 display。直接复用清单，两处不会漂移。
  display: manifest.display,

  async activate(ctx) {
    await ctx.tool.transform((tools) => {
      tools.namespace({ name: "acme.notes", description: "项目笔记" })
      tools.add({
        name: "search",
        description: "在项目笔记里搜索。",
        input: Schema.Struct({ query: Schema.String }),
        output: Schema.Struct({ hits: Schema.Array(Schema.String) }),
        execute: async ({ query }) => ({ output: { hits: [] }, content: query }),
      })
    })
  },
})
```

展示数据有两个来源，两处都要有，否则会出现「探索页有图标、安装后没有」：

- `METAINF.display` 决定安装前的发现卡片。
- `Plugin.define` 的 `display` 决定安装后的插件详情。
- 最简单且不会漂移的做法就是像上面这样直接复用清单里的 `display`。

工具注意：

- `input` 用 Effect Schema。模型传入的参数按它校验；字段要可选时用 `Schema.optional`。
- `execute` 返回 `{ output, content }`；`content` 是时间线里展示的内容。
- `options.namespace` 决定工具名前缀；`options.permission` 用于权限规则；`options.codemode` 决定是否进入 Code Mode 目录。

服务端 `ctx` 的常用域：

| 域 | 用途 |
| --- | --- |
| `ctx.tool` | 工具注册、`hook("execute.before" / "execute.after")` |
| `ctx.skill` | 技能注册 |
| `ctx.agent` | 增删改 agent |
| `ctx.command` | 服务端命令 |
| `ctx.session` | 会话操作与 `prompt` / `context` / `retry` 等 hooks |
| `ctx.session`（同上） | 用 `session.execution.succeeded` 等事件判断任务结束 |
| `ctx.event` | 订阅服务端事件，必须用 `types` 过滤 |
| `ctx.config` | 清单 `configuration` 声明的用户级配置 |
| `ctx.storage` | 插件自己的 JSON 状态 |
| `ctx.memory` | 插件自己的长期记忆（按插件隔离） |
| `ctx.secrets` | 加密保存的凭据 |
| `ctx.paths` | `data` / `cache` / `log` 三个插件目录 |
| `ctx.inbox` | 往应用收件箱投递事项 |
| `ctx.rpc` | 注册或调用跨进程 RPC 契约 |

事件订阅只订阅真正要处理的类型；`session.text.delta`、`session.reasoning.delta` 每秒几十条，不要全量订阅。

## 随包技能

`skills/<skill-id>/SKILL.md` 用 frontmatter 加正文：

```markdown
---
name: Acme 笔记
description: 用 acme.notes 工具读写项目笔记。
---

# Acme 笔记

当用户要查找或整理项目笔记时，使用 `acme.notes.search`。
```

在 `activate` 里读取并注册：

```ts
import { AbsolutePath } from "@opencode/schema/schema"
import { Skill } from "@opencode/schema/skill"

const file = new URL("../skills/acme-notes/SKILL.md", import.meta.url)
const content = await Bun.file(file).text()

await ctx.skill.transform((skills) =>
  skills.add(
    Skill.Info.make({
      id: Skill.ID.make("acme-notes"),
      name: Skill.Name.make("Acme 笔记"),
      description: "用 acme.notes 工具读写项目笔记。",
      path: AbsolutePath.make(file.pathname),
      content,
    }),
  ),
)
```

## 界面（可选）

`gui/main.tsx` 默认导出 GUI 的 `Plugin.define`。`setup` 必须是同步函数。

```tsx
import { Command, Plugin, Slot } from "@opencode/plugin/gui"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Slot, {
      at: "window.bottom",
      render: () => <div>Acme Notes</div>,
    })
    ctx.add(Command, {
      id: "open",
      title: "Acme: 打开笔记",
      run: () => ctx.toast.show({ title: "Acme Notes" }),
    })
  },
})
```

`vite.config.ts`：

```ts
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

export default defineConfig({ plugins: [gui()] })
```

界面侧约束：

- 构建产物必须是 CommonJS：`dist/gui/main.cjs`，不含 `import` / `export` 语句。
- 第三方界面只在桌面端加载，Web 端不加载。
- 界面 bundle 只能引用白名单模块：`effect`、`@opencode/plugin/gui`、`@opencode/plugin/gui/main`、`@opencode/plugin/rpc`、`@opencode/schema/rpc`、`@opencode/client`、`@opencode/client/effect`、`solid-js` 家族、`@opencode/client/solid`、`@opencode/plugin/gui/{file,review,browser}`。其余会被构建器拒绝。
- 不能替换内置组件的渲染逻辑；可以新增注册表条目、插槽内容、CSS 与主题。
- 与内置插件同 id 会被判定冲突，界面不加载。

## 构建

`script/build.ts`：

```ts
import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const dist = join(root, "dist")
const manifest = await Bun.file(join(root, "METAINF")).json()

await rm(dist, { recursive: true, force: true })
await mkdir(join(dist, "server"), { recursive: true })

const build = await Bun.build({
  entrypoints: [join(root, "server/main.ts")],
  target: "bun",
  format: "esm",
  outdir: join(dist, "server"),
  naming: "main.js",
  external: [...manifest.externals, "node:*"],
})

if (!build.success) {
  for (const log of build.logs) console.error(log)
  process.exit(1)
}

await cp(join(root, "skills"), join(dist, "skills"), { recursive: true }).catch(() => undefined)
await cp(join(root, "METAINF"), join(dist, "METAINF"))

await writeFile(
  join(dist, "package.json"),
  JSON.stringify(
    {
      name: manifest.id,
      version: manifest.version,
      type: "module",
      main: "./server/main.js",
      exports: { ".": "./server/main.js" },
    },
    null,
    2,
  ) + "\n",
)

console.log(`built ${manifest.id} ${manifest.version} -> ${dist}`)
```

有界面时，顺序固定：先 `bun run script/build.ts`，再 `bunx vite build`。反过来会丢掉界面产物。产物里的 `METAINF` 不改写，`entry.server` 始终是 `server/main`。

## 打包

`script/pack.ts`：

```ts
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, relative, sep } from "node:path"

const root = join(import.meta.dir, "..")
const dist = join(root, "dist")
const manifest = await Bun.file(join(root, "METAINF")).json()

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(directory, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    }),
  )
  return nested.flat()
}

const paths = (await walk(dist))
  .map((file) => relative(dist, file).split(sep).join("/"))
  .filter((p) => p !== "METAINF")
  .sort()

const files: Record<string, Uint8Array> = {}
const checks: { path: string; sha256: string }[] = []

for (const p of paths) {
  const bytes = new Uint8Array(await readFile(join(dist, ...p.split("/"))))
  files[p] = bytes
  checks.push({ path: p, sha256: createHash("sha256").update(bytes).digest("hex") })
}

files["METAINF"] = new TextEncoder().encode(
  JSON.stringify({ ...manifest, files: checks }, null, 2) + "\n",
)

const out = join(homedir(), ".distribution", "plugins", manifest.id, manifest.version)
await mkdir(out, { recursive: true })

const archive = join(out, `${manifest.id}-${manifest.version}.exc`)
await Bun.Archive.write(archive, files, { compress: "gzip", level: 9 })

console.log(`packed ${archive}`)
```

`package.json` 的脚本：

```json
"scripts": {
  "build": "bun run script/build.ts",
  "pack": "bun run script/pack.ts"
}
```

打包规则：

- `.exc` 是 gzip 压缩的 tar 包，根目录必须有 `METAINF`。
- 清单里的 `files` 由打包脚本重写，包含每个文件的 sha256；`METAINF` 自己不列入。
- 每个版本目录只留一个 `.exc`。
- 输出位置：`~/.distribution/plugins/<id>/<version>/<id>-<version>.exc`。
- 安装器只做 sha256 完整性校验，没有签名与来源验证。

## 图标

`display.icon` 是插件的身份 mark，会显示在 Explore 的插件列表卡片上。它按 `docs/standard/design` 的「品牌 mark」例外处理：允许彩色与品牌渐变，不受功能图标「单色」的限制。

生成规则：

1. `viewBox="0 0 24 24"`，不要写死 `width` / `height`，由容器决定尺寸。
2. 24×24 网格内留 3px 内边距：主体落在 `x=3..21`、`y=3..21`。
3. 只画一个主体概念，用两到三个色相。禁止堆叠多个不相关图形。
4. 允许圆角矩形底 + 一层白色/浅色笔画作为内部符号；圆角用 5–6，与产品圆角阶梯一致。
5. 禁止投影、外发光、模糊滤镜、位图、`<image>`、外部字体、`<style>` 标签与脚本。
6. 禁止文字（包括缩写字母当主体）；不要用 emoji。
7. 图标要在浅色与深色两种 `bg-layer-02` 上都可读：主体不要用纯黑或接近背景的灰。
8. 所有 `id`（渐变、裁剪等）必须带插件 id 前缀，例如 `acme-notes-a`。多个插件图标会同时出现在一个页面里，`id` 全局唯一，重复会让后渲染的图标引用到别人的渐变。
9. 最终写成一行 JSON 字符串放进 `display.icon`，并保持引号转义正确。

模板：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="acme-notes-body" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38BDF8"/>
      <stop offset="1" stop-color="#4F46E5"/>
    </linearGradient>
  </defs>
  <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#acme-notes-body)"/>
  <path d="M8 9h8M8 12.5h5" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/>
</svg>
```

图标自检：

- [ ] `viewBox` 是 `0 0 24 24`，没有固定宽高。
- [ ] 所有渐变/裁剪 `id` 带插件 id 前缀。
- [ ] 没有投影、发光、滤镜、图片、文字、脚本。
- [ ] 缩到 16px 仍能认出一个主体。
- [ ] 在浅色与深色背景上都不糊。
- [ ] 字符串已正确转义并放进 `display.icon`。

## 自检清单

- [ ] `METAINF` 的 `id` 与 `server/main.ts` 的 `id` 一致。
- [ ] `entry.server` 是 `server/main`，`entry.gui`（如有）是 `gui/main`。
- [ ] `externals` 含 `effect`、`@opencode/plugin`、`@opencode/schema`。
- [ ] `display.name` 与 `display.description` 非空。
- [ ] `skills[].path` 指向真实存在的文件，且 `activate` 里注册了对应技能。
- [ ] `bun install` 成功，`bun run build` 产出 `dist/server/main.js`。
- [ ] 有界面时，`dist/gui/main.cjs` 是 CommonJS，没有 `import` / `export`。
- [ ] `bun run pack` 产出 `~/.distribution/plugins/<id>/<version>/<id>-<version>.exc`。
- [ ] `.exc` 里 `METAINF` 带 `files[].sha256`，每个文件都能对上。
- [ ] 图标满足「图标自检」。

## 常见错误

| 报错 | 原因 |
| --- | --- |
| `This is not a plugin bundle: METAINF is missing.` | 压缩包根目录没有 `METAINF` |
| `This plugin bundle has no <kind> entry. Expected …; tried …` | 该部件的入口文件不在包里，按 `Expected` 补文件 |
| `This plugin bundle has a display without a name and description.` | `display` 缺 `name` 或 `description` |
| `This plugin bundle is incomplete: <path> is missing.` | `skills[].path` 指向的文件不在包里 |
| `This bundle is damaged: <path> does not match its checksum.` | 打包后改过文件，重新打包 |
| `This bundle is <id>, not <requested id>.` | 清单 `id` 与安装请求不一致 |
| `This plugin needs AI Craft >= x.y.z; this app is a.b.c.` | `requires.opencode` 高于当前应用版本 |
| `A plugin's GUI must have a window setup, a main setup, or both` | 界面定义里 `setup` 与 `main` 都没有 |
| `<module> is not a module the AI Craft app provides to plugin GUIs` | 界面 bundle 引用了白名单外的模块 |
| `Plugin activation did not finish within 30s` | `activate` 里有可中断的长时间等待 |
| `Plugin load timed out after 15s` | 模块加载或解析超过 15 秒 |

## 路径速查

| 路径 | 作用 |
| --- | --- |
| `~/.aicraft/exc/<id>/` | 已安装插件，放入即加载 |
| `~/.aicraft/plugin-data/<id>/` | `ctx.paths.data`，卸载后保留 |
| `~/.aicraft/plugin-cache/<id>/` | `ctx.paths.cache`，卸载时删除 |
| `~/.aicraft/logs/plugin/<id>.log` | `ctx.paths.log`，卸载后保留 |
| `~/.distribution/plugins/<id>/<version>/` | 本地发现目录，Explore 从这里列出可安装版本 |

热更新不生效时，确认覆盖的是 `~/.aicraft/exc/<id>/` 而不是工程里的 `dist/`；改完文件后触碰目录触发重载。插件进入加载失败退避后，用 `POST /api/experimental/plugin/reload` 或详情页的「重试」立即恢复。

## 能力边界

- 公开 API 只提供已有窗口的读取（`ctx.windows`）与页面嵌入（`ctx.embeds`）。创建独立窗口要 `require("electron")`，属于非公开路径，升级不保证兼容。
- 不能替换内置组件的渲染逻辑，只能新增注册表条目、插槽内容、CSS 与主题。
- 清单没有权限字段，安装器不做逐项授权提示。
- `configuration` 不会自动渲染设置页；需要设置页就自己 `ctx.add(SettingsPage)`。
- 收件箱（`ctx.inbox`）是给用户看的事项列表，不是会话消息队列；用户可随时删除任意一条。
