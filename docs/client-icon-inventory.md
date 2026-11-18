# 客户端图标清单

本文盘点桌面客户端界面上需要重做的图标，作为重设计的输入清单与验收对照表。

范围只覆盖客户端界面本身：**通用 UI 图标、桌面应用图标、产品 logo**。
提供商图标（`provider-icons`，103 个）与文件类型图标（`file-icons`，1,089 个）不在本次范围内。

所有数值以代码为准，清单由 `packages/ui/src/icons/catalog.ts` 的 `iconNames()` 导出结果核对。

---

## 事实来源

| 集合 | 源文件 | 渲染方式 |
| --- | --- | --- |
| 通用 UI 图标 | `packages/ui/src/icons/catalog.ts`（主集合）+ `packages/ui/src/icons/icon/additional-icons.ts`（附加集合） | 运行时把 SVG 字符串注入 `<symbol>` sprite，`<use href="#opencode-v2-icon-<name>">` 引用 |
| 实验画稿 | `packages/ui/src/icons/new-icons.ts` | 同名 `-new` symbol，实验开关开启时替换外观 |
| 桌面应用图标 | `packages/ui/src/components/app-icon.tsx` + `packages/ui/src/assets/icons/app/` | `<img src>` 直接引用资源 |
| 产品 logo | `packages/app/src/providers/opencode-logo.tsx` | 内联 SVG 组件 |

DOM 标记：UI 图标为 `[data-slot="icon-svg"]`，应用图标为 `[data-component="app-icon"]`，logo 为 `[data-component="opencode-logo"]`。三个标记是调试高亮与验收脚本的稳定选择器。

---

## 一、通用 UI 图标（178）

主集合 64 个，附加集合 114 个，合并后 178 个唯一名称。

### 导航栏（12）

`rail-home` `rail-home-active` `rail-history` `rail-history-active` `rail-inbox` `rail-inbox-active` `rail-library` `rail-library-active` `rail-compass` `rail-compass-active` `rail-download` `rail-more`

### 布局（9）

`layout-left` `layout-left-full` `layout-left-partial` `layout-right` `layout-right-full` `layout-right-partial` `layout-bottom` `layout-bottom-full` `layout-bottom-partial`

### outline 系列（39）

`outline-arrow-left` `outline-arrow-right` `outline-arrow-up-right` `outline-arrow-to-corner-top-right` `outline-audio` `outline-brain` `outline-browser-annotate` `outline-chevron-down` `outline-chevron-right` `outline-code-brackets` `outline-console` `outline-cookie` `outline-copy` `outline-dots` `outline-expand` `outline-eye` `outline-eye-slash` `outline-globe` `outline-globe-plus` `outline-hexagonal-warning` `outline-list-changelog` `outline-magnifier-minus` `outline-magnifier-plus` `outline-pair` `outline-photo` `outline-quote` `outline-reset` `outline-rotate-clockwise` `outline-share` `outline-sliders` `outline-square-arrow` `outline-steer` `outline-text` `outline-trash` `outline-undo` `outline-video` `outline-wave-audio` `outline-worktree` `outline-xmark`

### 其余（118）

`align-right` `appearance` `archive` `arrow-down-to-line` `arrow-left` `arrow-right` `arrow-undo-down` `arrow-up` `arrow-up-right` `brain` `branch` `branch-out` `bubble-5` `bullet-list` `check` `check-small` `checklist` `chevron-double-right` `chevron-down` `chevron-grabber-vertical` `chevron-left` `chevron-right` `circle-ban-sign` `circle-check` `circle-exclamation` `circle-x` `circle-xmark` `close` `close-small` `cloud-upload` `code` `code-lines` `code-slash` `collapse` `comment` `console` `copy` `cube` `dash` `discord` `dot-grid` `download` `edit` `edit-small-2` `enter` `expand` `extensions` `eye` `file-document` `file-tree` `file-tree-active` `filetree` `fill-triangle-down` `flask` `folder` `folder-add-left` `fork` `github` `glasses` `globe` `graduation-cap` `grid-plus` `help` `info` `keyboard` `link` `lock` `magnifying-glass` `magnifying-glass-menu` `mcp` `menu` `minus` `models` `monitor` `new-session` `new-session-active` `notifications` `open-file` `pencil-line` `photo` `plus` `plus-small` `post-skill` `prompt` `providers` `refresh` `reset` `review` `review-active` `select-element` `selector` `server` `settings-gear` `share` `shield` `sidebar` `sidebar-active` `sliders` `speech-bubble` `split` `square-arrow-top-right` `status` `status-active` `stop` `task` `terminal` `terminal-active` `titlebar-chat` `trash` `unified` `warning` `waveform` `window-analytics` `window-cursor` `workspace` `workspace-isolated` `workspace-new` `xmark-small`

### 尺寸与网格

| 项 | 规则 |
| --- | --- |
| 主集合 viewBox | 全部 `0 0 16 16` |
| 附加集合 viewBox | 默认 `0 0 20 20`；`magnifying-glass`、`arrow-undo-down`、`notifications`、`appearance`、`extensions`、`sliders`、`providers`、`models`、`speech-bubble`、`titlebar-chat` 为 `0 0 16 16` |
| 渲染尺寸 | `size="small"` 14px（新画稿为 16px）、`size="normal"` 16px、`size="large"` 20px |
| 颜色 | 全部使用 `currentColor`，不写死颜色 |
| RTL | `arrow-left`、`arrow-right`、`outline-arrow-left`、`outline-arrow-right`、`outline-chevron-right`、`chevron-left`、`chevron-right` 带 `data-directional`，RTL 下水平镜像 |

### 重设计约束

- 画在 16×16 网格上，视觉重心居中；外层 `<svg>` 会居中 viewport，重心偏移会显得偏。
- 描边使用 `currentColor`，线宽与现有系列一致（主集合多为 1，附加集合有 1 与 1.5 两档），不引入第二套线宽。
- 成对图标（`*-active`、`rail-*`）必须共用同一轮廓，只改填充或强调部分，避免切换时跳动。
- 新增或替换画稿走 `new-icons.ts` 的实验通道先验证，确认后再并入主集合。
- 图标语义不变，只换画法；名字是对外的稳定契约，不要改名。

---

## 二、桌面应用图标（15）

用于「在外部编辑器中打开」一类的应用识别，共 15 个名称，16×16 展示（`size-4`），其中 `zed` 有明暗两版。

| 名称 | 资源 | 格式 |
| --- | --- | --- |
| `vscode` | `assets/icons/app/vscode.svg` | SVG |
| `cursor` | `assets/icons/app/cursor.svg` | SVG |
| `zed` | `assets/icons/app/zed.svg`、`zed-dark.svg` | SVG（按 `data-color-scheme` 切换） |
| `file-explorer` | `assets/icons/app/file-explorer.svg` | SVG |
| `finder` | `assets/icons/app/finder.png` | PNG |
| `terminal` | `assets/icons/app/terminal.png` | PNG |
| `iterm2` | `assets/icons/app/iterm2.svg` | SVG |
| `ghostty` | `assets/icons/app/ghostty.svg` | SVG |
| `warp` | `assets/icons/app/warp.png` | PNG |
| `xcode` | `assets/icons/app/xcode.png` | PNG |
| `android-studio` | `assets/icons/app/android-studio.svg` | SVG |
| `antigravity` | `assets/icons/app/antigravity.svg` | SVG |
| `textmate` | `assets/icons/app/textmate.png` | PNG |
| `powershell` | `assets/icons/app/powershell.svg` | SVG |
| `sublime-text` | `assets/icons/app/sublimetext.svg` | SVG |

PNG 那 5 个是第三方应用的官方标识，重设计时保持品牌识别度，不要改成通用线条图；需要矢量版时替换为官方 SVG 资源，而不是自己重画。

`AppIcon` 组件按 `id` 从静态映射取资源，新增名称需要同时补 `app-icons/types.ts` 的 `iconNames`。

---

## 三、产品 logo（1）

`packages/app/src/providers/opencode-logo.tsx`，`viewBox="0 0 16 16"`，纯 `currentColor` 双路径（外框 + 20% 透明度内块）。

使用位置：

- `packages/app/src/settings/providers/providers.tsx`：提供商列表里的 OpenCode 行，`size-4`
- `packages/app/src/providers/models/provider-group.tsx`：模型分组的提供商图标与选择器行

重设计要点：16×16 下必须仍能辨认；单色 `currentColor`，不引入渐变或第二色；内外两块的关系（实心框 + 半透明填充）是品牌资产，改动前先确认。

---

## 调试高亮

改造期间用运行时高亮确认覆盖范围，不改代码、不重启客户端：

1. 客户端以 dev 模式运行（`packages/desktop` 的 electron-vite，渲染进程连 `http://localhost:5173`），CDP 端口 9222。
2. 向页面注入一段样式，给三类选择器加黄色描边与半透明底：

```css
[data-slot="icon-svg"],
[data-component="app-icon"],
[data-component="opencode-logo"] {
  outline: 1.5px solid #ffd400 !important;
  outline-offset: 1px !important;
  background: rgba(255, 212, 0, 0.22) !important;
  border-radius: 2px !important;
}
```

3. 同时给每个元素写入 `data-icon-name`（从 `<use href="#opencode-v2-icon-<name>">` 解析），便于在 DevTools 里核对名称；用 `MutationObserver` 监听新增节点，路由切换后新图标自动标记。

高亮是运行时注入，刷新页面即消失，不进入版本库。

---

## 验收清单

- [ ] 178 个 UI 图标全部改完，没有遗留旧画稿
- [ ] 成对图标（`*-active`、`rail-*`）切换时轮廓一致
- [ ] 16px 与 20px 两档渲染都清晰，小尺寸下不糊
- [ ] 暗色、浅色下 `currentColor` 都能达到对比度要求
- [ ] RTL 下带 `data-directional` 的 7 个箭头方向正确
- [ ] 15 个应用图标品牌识别度未被破坏
- [ ] logo 在 16px 下可辨认，单色渲染正常
- [ ] 页面里不再出现高亮标记（调试样式已移除）
