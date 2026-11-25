# AIX 迁移测试用例清单

基线：`docs/aix/spec.md`。执行原则：每条标注「改现有」（在既有测试上改名即可覆盖）、「新增」（迁移本身需要的新断言）或「人工」（无法自动化，走查）。回归命令一律在对应 package 目录跑单文件，超时 ≤30s。

## A. 包格式与命名

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| A1 | `script/pack.ts` 产出 `<id>-<version>.aix`，路径排序、mtime 归零，两次打包字节一致 | 改现有 + 人工跑 `bun run pack` | `plugins/webwright/script/pack.ts`（其余 4 个插件同款抽查 itsm） |
| A2 | 发现目录版本文件只认 `.aix`：版本目录里只有 `.exc` 时该版本不可见、不可安装 | 新增 | `packages/aix/test/bundle.test.ts` |
| A3 | `find` 回退目录（Desktop/Downloads/cwd/config plugins）只匹配 `.aix` 后缀 | 改现有 | `packages/aix/test/bundle.test.ts` |
| A4 | 安装根为 `~/.aicraft/aix`、暂存根为 `~/.aicraft/aix-staging`，卸载删 `~/.aicraft/aix/<id>` 且触发热更新 | 改现有 | `packages/server/test/plugin-bundle.test.ts`、`plugin-uninstall.test.ts` |
| A5 | 成功安装后暂存根为空（原子 rename 后进安装根） | 改现有 | `packages/server/test/plugin-bundle.test.ts` |

## B. 安装管线与校验

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| B1 | apiVersion/id/version/`files[].sha256` 校验与拒绝文案（文案中 bundle 称谓同步） | 改现有 | `packages/core/test/plugin/bundle.test.ts` → 迁至 `packages/aix/test/bundle.test.ts` |
| B2 | `requires.aicraft` 最低版本判定不受改名影响 | 改现有 | 同上 |
| B3 | entry 旧路径回退（`server/index` 等）仍照常加载并警告 | 改现有 | `packages/core/test/plugin/module.test.ts`（不动语义，仅 import 来源指向 aix） |
| B4 | **externals 旧名映射**：清单声明 `@aicraft/plugin` 时软链指向 `@aicraft/aix` 包目录，并出现 deprecation 警告 | 新增 | `packages/aix/test/bundle.test.ts` |
| B5 | externals 声明 `@aicraft/aix` / `@aicraft/schema` / `effect` 时直接解析成功 | 改现有 | `packages/aix/test/bundle.test.ts` |
| B6 | Windows：已加载插件的文件无法 rename 时安装报显式错误（不静默旧版本） | 改现有 | 保持 `bundle.test.ts` 现有用例 |

## C. SDK 包 `@aicraft/aix`

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| C1 | `exports` 子路径集合与旧 `@aicraft/plugin` 完全同构（`.`/`effect`/`tui`/`gui*`/`host`/`runtime`/`rpc`/`options`/`skill-package`/`storage`/`worktree`/`permission`/`app`/`./*`） | 新增（断言 package.json） | `packages/aix/test/exports.test.ts` |
| C2 | `gui/host`、`gui/builtin`、`gui/updater` 不进 `dist`（`tsconfig.build.json` + `script/pack.ts` 为 null） | 改现有 | `packages/aix/script/pack.ts` 人工核对 + `bun run build` 产物清单 |
| C3 | CLI 打包不含 `gui/`（`runtime-modules` 跳过） | 改现有 | `packages/cli/script/build.ts` 相关既有测试 |
| C4 | `bun install` 后 workspace 内无 `@aicraft/plugin` 依赖残留（bun.lock 中仅产物 npm 名 `@aicraft/plugin-*`） | 人工 | `git grep '@aicraft/plugin"' -- bun.lock` 为空 |

## D. 协议与生成物

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| D1 | `experimental.plugin.bundle/uninstall` 描述文本含 `.aix`，路径与 identifier 不变 | 改现有 | `packages/protocol/test/experimental-identifiers.test.ts` 既有守卫 |
| D2 | `bun run generate`（protocol）后 `openapi.json` 无未提交 diff；`check:generated` 通过 | 人工/CI | `packages/protocol` |
| D3 | `packages/client` 的 `bun run generate` 重跑无手写漂移（生成物一致） | 人工 | `packages/client` |
| D4 | server 端 bundle 端点行为不变：装 `.aix` 成功、装 `.exc` 报 `No <id> bundle was found` | 改现有 | `packages/server/test/plugin-bundle.test.ts` |

## E. 客户端 UI（app / desktop）

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| E1 | Explore 目录 `bundle.format === "aix"`，卡片文件名 `<id>-<version>.aix` | 改现有 | `packages/app/src/explore/catalog.ts` 相关组件测试（`component-tests/explore.fixture.tsx` 同步） |
| E2 | 安装对话框注记文案指向 `~/.aicraft/aix` | 改现有 | 组件测试快照/文案断言 |
| E3 | i18n：`explore.plugins.install.bundle.note` 的 en/zh 值不含 “exc”；其余语言无残留 | 人工 grep + 新增文案守卫 | `packages/app/src/runtime/i18n/` |
| E4 | desktop `distribution.ts` 以 `AIX_OUT` 调 pack，生产资源目录内是 `.aix` | 人工 | `bun run build` 后检查资源树（desktop AGENTS 规定的 Electron 验证一并做） |
| E5 | 桌面端加载新打的 `.aix` 插件（webwright）：工具注册、GUI 白名单新旧路径（`@aicraft/aix/gui` 与旧 `@aicraft/plugin/gui`）均可解析 | 人工 | `bun run dev:desktop` 实测一次安装→加载→卸载 |

## F. 运行时热更新与发现

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| F1 | supervisor 监视 `~/.aicraft/aix`：放入/替换目录即重载 | 改现有 | `packages/core/test/plugin/supervisor.test.ts` |
| F2 | 安装根内损坏目录（非 `.aix` 解包形态）不阻塞其余插件加载 | 改现有 | 同上 |

## G. 文档与统管守卫

| # | 用例 | 方式 | 落点 |
| --- | --- | --- | --- |
| G1 | 全仓不残留 `.exc` / `exc-staging` / `EXC_OUT` / `docs/exc-dev` 引用（例外：CHANGELOG 历史、B4 兼容映射与其测试、手册「旧称」说明） | 人工命令 | 见下方守卫命令 |
| G2 | 全仓不再出现 `@aicraft/plugin`（精确匹配，排除 `@aicraft/plugin-*` 产物名；例外：B4 映射、GUI 白名单旧路径、手册兼容节、CHANGELOG、bun.lock 旧行） | 人工命令 | 同上 |
| G3 | `docs/aix-dev/index.html` 与实现同步：METAINF 示例、externals 集合、路径速查、`requires.aicraft` 修正、`create-aix` 标注为计划项 | 人工走查 | 对照 spec §6 |
| G4 | creator 技能正文产出 `.aix` 且引用 `docs/aix-dev` | 人工走查 | `packages/core/src/plugin/skill/creator.md` |
| G5 | 统管不变量：新增代码不得在 aix 之外定义插件目录/发现/安装逻辑（review 规则，无自动化） | 规范 | spec §1 |

### 守卫命令（验收时执行，工作区根）

```powershell
git grep -nI -e '\.exc\b' -e 'EXC_OUT' -e 'exc-staging' -e 'docs/exc-dev' -- ':!CHANGELOG.md'
git grep -nI '@aicraft/plugin[/" ]' -- ':!CHANGELOG.md' ':!bun.lock'
```

两条命令的输出必须逐项对应 G1/G2 登记的例外，出现例外之外的命中即验收失败。

## H. 受影响包的编译与 lint 门禁

- `bun typecheck`：`aix`、`core`、`server`、`protocol`、`client`、`app`、`desktop`、`cli`、`sdk`、`gui-plugins`、`plugin-browser`、`tui`、`web`（若引用）
- `bun run lint:changed`（仓库根）
- `packages/plugin/test`（现 `packages/aix/test`）既有 suite 全绿；`packages/core/test/plugin/` 全绿；`packages/server/test/plugin-*.test.ts` 全绿。
