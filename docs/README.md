# 项目文档

`docs/` 是本仓库唯一的文档根。根目录只保留 `README.*`（多语言介绍）、`AGENTS.md`（工程约定）、`CONTRIBUTING.md`、`CHANGELOG.md`、`SECURITY.md`；其余项目文档一律放在这里。

## 目录

### 设计规范 —— `standard/design/`

桌面客户端 UI 的唯一事实来源，覆盖颜色、字号、间距、圆角、动效、组件、主题、图标、密度、导航、可访问性等 19 个篇目，附验收清单与设计稿原型。

入口先读 [`standard/design/README.md`](standard/design/README.md) 与 [`01-principles.md`](standard/design/01-principles.md)，交付前对照 [`checklist.md`](standard/design/checklist.md)。

> 项目内不存在第二套 UI 规范。任何界面决策有疑问，以本目录为准，不要新建平行标准。

### 工程契约

| 文档 | 内容 | 何时读 |
|---|---|---|
| [skill-plugin-standard.md](skill-plugin-standard.md) | 技能与插件的发现、加载契约与编写约定 | 编写或修改技能、插件加载器时 |
| [aix-dev/index.html](aix-dev/index.html) | `.aix` 第三方插件开发手册：工程目录、打包分发、服务端与 GUI API、调试（已实现，描述当前实现；事实来源 `packages/aix`、`packages/core`、`plugins/*/script/pack.ts`） | 开发或排查 `.aix` 插件时 |
| [desktop-project-manager.md](desktop-project-manager.md) | 桌面端派活手册：范围、拆分、验收口径 | 组织多人/多会话开发时 |

## 维护约定

- **状态行必填**：每份文档开头写清状态（`长期维护` / `设计稿（未实现）` / `已实现，描述当前实现` / `已废弃`），并注明事实来源（代码路径）。
- **描述已实现的文档只描述现状**：功能落地后同步更新状态，或直接删除；不要把设计方案当成当前实现留着。
- **不引用行号**：用 `文件路径` + 符号名定位，行号会随代码漂移。
- **一次性产物不进仓库**：派活计划、临时设计图、单次评审稿完成即删。
