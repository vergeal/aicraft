# AIX 插件子系统规范

状态：正式（`subsystem/aix` 分支落地基线）
前身：`.exc` 插件系统（本规范生效后一律以 AIX 指代）
开发手册：`docs/aix-dev/index.html`（面向插件作者）；本文是面向平台开发者的规范事实来源。

## 1. 目标与统管原则

AIX 是 AI Craft 客户端唯一的插件子系统。统管的含义按以下不变量约束，任何新增插件能力都必须落在其中：

1. **能力定义走 SDK**：插件可见的全部 API（服务端 Promise/Effect API、GUI SDK、RPC 契约、TUI SDK）只从 `@aicraft/aix` 包导出。宿主不为单个插件另开私有接口通道。
2. **分发走 `.aix` 包**：第三方插件的分发单位是单文件 `.aix` bundle（gzip tar + 包内 `METAINF`）。发现、校验、解包、externals 链接、卸载的契约由 aix 子系统的安装/发现层定义，其他包不得复制这套逻辑。
3. **安装契约走协议端点**：安装、卸载、本地列表、重试、运行环境准备只经 `experimental.plugin.*` HTTP 端点暴露，描述与实际行为以本规范为准。
4. **目录布局走 `PluginPaths`**：插件的 data / cache / runtime / log / 安装根 / 暂存根路径只在 aix 子系统的 `paths.ts` 与 `local.ts` 里定义，消费方（core 运行时、desktop、server）一律导入，不自拼路径。
5. **例外必须显式登记**：内置插件（编译进 core）、`aicraft.json` 的 `plugins` 配置项（npm 包 / 本地目录）沿用同一 SDK 与入口契约，属于同一子系统内的加载源，不是绕开。除此之外出现的新插件路径都视为违例。

## 2. 命名规范（正式改名）

| 项 | 旧（.exc 时代） | 新（AIX） |
| --- | --- | --- |
| bundle 扩展名 | `.exc` | `.aix` |
| bundle 格式名 | `exc` | `aix` |
| 安装根 | `~/.aicraft/exc/` | `~/.aicraft/aix/` |
| 解包暂存根 | `~/.aicraft/exc-staging/` | `~/.aicraft/aix-staging/` |
| 本地发现根 | `~/.distribution/plugins/` | 不变（插件与技能共用分发根） |
| 打包输出环境变量 | `EXC_OUT` | `AIX_OUT` |
| SDK 包名 | `@aicraft/plugin` | `@aicraft/aix` |
| SDK 目录 | `packages/plugin` | `packages/aix` |
| 开发手册 | `docs/exc-dev/index.html` | `docs/aix-dev/index.html` |
| HTTP 端点路径/identifier | `experimental.plugin.bundle` 等 | 不变（路径本就不含 exc 字样） |

**硬切换**：宿主只认 `.aix`。`.exc` 文件不再被发现有、安装查找或解包接受；旧包必须由作者用更新后的 `script/pack.ts` 重新打包。安装根目录不做自动迁移，旧 `~/.aicraft/exc/` 下的已安装插件需重装。

## 3. 包格式（apiVersion 1，结构不变）

`.aix` 仍是 gzip 压缩的 tar：根目录必须有 `METAINF`（JSON 清单），`files[].sha256` 逐项校验；确定性打包要求路径排序、mtime 归零。清单字段、入口标准（`entry` 以 `/main` 结尾、按部件扩展名顺序解析）、`runtime`、`configuration`、`display` 语义与 apiVersion 1 现行定义完全一致，本次改名不改结构，`apiVersion` 仍为 `1`。

### 3.1 externals 与旧名映射

- 新 bundle 的 `externals` 声明宿主注入的包名，标准集合：`effect`、`@aicraft/aix`、`@aicraft/schema`、`@aicraft/util`、`@aicraft/client`。
- **唯一保留的旧名兼容**：安装期 `linkExternals` 把清单里遗留的 `@aicraft/plugin` 映射到 `@aicraft/aix` 包目录再做软链，并打一条 deprecation 警告（`console.warn`，与旧入口路径同风格）。这是迁移窗口内的兼容点，不属于统管面的扩大；移除条件见 §7。
- GUI bundle 的运行时模块白名单同步收录 `@aicraft/aix/gui*` 等新路径，同时继续接受 `@aicraft/plugin/gui*` 旧路径（解析到同一宿主模块），保证旧界面 bundle 求值不炸；白名单文档以新路径为准。

## 4. 代码归属

### 4.1 `packages/aix`（`@aicraft/aix`）

原 `packages/plugin` 全部内容 + 从 core 迁入的 bundle 安装/发现层：

| 模块 | 内容 |
| --- | --- |
| `src/promise/`、`src/effect/`、`src/tui/`、`src/gui/` | 四套插件 SDK（Promise/Effect/TUI/GUI），子路径与旧包一致 |
| `src/host.ts`、`src/runtime.ts`、`src/runtime-modules.ts`、`src/source*.ts` | 入口解析、宿主模块运行时、加载器支撑 |
| `src/storage.ts`、`src/worktree.ts`、`src/skill-package.ts`、`src/rpc.ts`、`src/options.ts`、`src/permission.ts`、`src/app.ts` | SDK 域模块 |
| `src/bundle.ts` | `.aix` 安装/卸载/校验/externals 链接（原 `core/src/plugin/bundle.ts`） |
| `src/local.ts` | 本地发现根列举、安装根与暂存根常量、版本比较（原 `core/src/plugin/local.ts`） |
| `src/configuration.ts` | 声明式配置校验与读写（原 `core/src/plugin/configuration.ts`） |
| `src/paths.ts` | 插件 data/cache/runtime/log 目录布局与 Windows D 盘判定（原 `core/src/plugin/paths.ts`） |

导出约定延续旧包：`gui/host`、`gui/builtin`、`gui/updater` 仍是 workspace-only（`dist` 排除）；`files` 发布产物名与 `repository.directory` 同步改为 aix。

依赖方向：aix 只依赖 schema/util/client/protocol/ai 与 effect 等既有下层包，不依赖 core/server/app；core 的插件运行时（`runtime.ts` 服务、`module.ts`、`supervisor.ts`、`service.ts`、hooks）留在 core，从 `@aicraft/aix/*` 导入契约与安装层。

### 4.2 消费方

- `packages/core/src/plugin/*`：加载运行时，改 import 来源；对 bundle/local/configuration/paths 的引用全部指向 aix。
- `packages/server`、`packages/protocol`：端点描述文本改 `.aix`；行为不变。
- `packages/app`：Explore 目录 `bundle.format` 从 `"exc"` 改为 `"aix"`，文案与 i18n 中的目录字样同步。
- `packages/desktop`：`distribution.ts` 用 `AIX_OUT`。
- `plugins/*`：`METAINF.externals`、`script/pack.ts`（产物名 `.aix`）、`script/build.ts` external 列表、`dev-link.ts` 安装目录同步；包名 `@aicraft/plugin-*` 是产物 npm 名，不随 SDK 改名。
- `services/www`、`packages/tui`、`gui-plugins`、`cli`、`sdk`、`latex`、`merman`、`plugin-browser`、`simulation`、`stories`：仅 import 来源改名。

## 5. 接口同步清单（对外可见面）

1. `experimental.plugin.bundle` / `experimental.plugin.uninstall` 的 OpenAPI description：`.exc bundle` → `.aix bundle`。路径与 identifier 不变。
2. `packages/protocol/openapi.json` 经 `bun run generate`（protocol 包）重生成。
3. 客户端 SDK 从 `packages/client` 跑 `bun run generate` 重生成；本仓库不手改生成物。
4. i18n：`explore.plugins.install.bundle.note` 等提到 `~/.aicraft/exc` 的 key 值改为 `~/.aicraft/aix`；用户可见文案不含 “exc” 一词。
5. 插件能力文档 `docs/skill-plugin-standard.md`、`docs/README.md`、`plugins/README.md` 及各插件 README 同步改名。
6. `packages/core/src/plugin/skill/creator.md`（creator 技能正文）同步：产出 `.aix`、externals 用 `@aicraft/aix`、手册路径 `docs/aix-dev`。技能加载器留在 core（文本资源 import 与技能注册是 core 运行时职责）。

## 6. 已知文档缺陷修正

- 手册 2.12 引用的 `packages/create-exc` 脚手架在仓库中不存在。本次迁移把手册该节改为 `create-aix` 并明确标注「计划中的脚手架，当前不存在；工程骨架以 creator 技能（`packages/core/src/plugin/skill/creator.md`）为准」，不再描述不存在的命令。
- 手册 METAINF 示例中 `"requires": { "opencode": ... }` 与实现读取的 `requires.aicraft` 不一致，同步修正为 `aicraft`。

## 7. 兼容窗口的退出条件

以下两项是改名后仅存的 `@aicraft/plugin` 字符串，满足条件后删除：

1. `linkExternals` 旧名映射：`plugins/*` 与对外分发的所有 bundle 的 `METAINF.externals` 全部改写为 `@aicraft/aix`，且真实加载日志中不再出现该 deprecation 警告。
2. GUI 白名单旧路径：桌面端不再加载引用 `@aicraft/plugin/gui*` 的旧 bundle（同上，以日志为准）。

移除时在 `CHANGELOG.md` 记录，并与手册对应小节同一次改动完成。

## 8. 验收

实现必须通过 `docs/aix/test-plan.md` 列出的用例清单；文档一致性用其中的 grep 守卫命令验收（允许清单里显式登记的例外）。
