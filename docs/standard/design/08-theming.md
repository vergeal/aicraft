# 08 · 主题架构与暗色模式

## 1. 两套实现

### 实现 A：单层 `light-dark()`

```css
:root { color-scheme: light dark; }
--color-text: light-dark(#0d0d0d, #fff);
--color-surface: light-dark(#fff, #212121);
--color-border: light-dark(#0000001a, #ffffff26);
```

- 深浅两值写在同一条声明里，由浏览器按 `color-scheme` 解析。
- 切换主题 = 切换 `color-scheme`（或 `data-theme` 属性），变量声明本身不动。
- 外层还有 `--app-color-*`（70 个）作为应用级覆盖层，允许不同子应用（实现 A / 子应用 / 编辑器）在同一套语义上换皮。

### 实现 B：两层表 + 属性开关

```
:root { ...浅色基准... }
body[data-ds-dark-theme] { ...深色覆盖... }
```

```html
<html data-ds-theme-source="system|light|dark">
<body data-ds-dark-theme>   <!-- 布尔属性，存在即深色 -->
```

`data-ds-theme-source` 记录**用户偏好**（system 仍是 system，不解析结果）；`data-ds-dark-theme` 是**解析后的实际状态**。两者分离，避免"跟随系统时无法判断用户选了跟随"。

## 2. 首屏防闪（FOUC）

这是主题系统最容易翻车的地方。实现 B 的做法（`ui-theme/src/boot-theme.ts`）：

```ts
// 1. <head> 内联 CSS：在脚本执行前就把画布涂对
function bootThemeStyle(preference) {
  const light = `:root{color-scheme:light}body{background-color:#fff;--boot-bg:#fff}`
  const dark  = `:root{color-scheme:dark}body{background-color:#151517;--boot-bg:#151517}`
  if (preference === 'light') return light
  if (preference === 'dark')  return dark
  return `${light}@media(prefers-color-scheme:dark){${dark}}`
}

// 2. <body> 末尾的同步脚本：在实际渲染前写入属性与字号
(() => {
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.style.setProperty('--content-font-size', '14px')
})()
```

关键点：

1. **背景色直接内联在 head**，不等 CSS 文件加载——否则白屏一闪。
2. **字号也是首屏注入**，否则内容会先用默认字号排版再跳一次。
3. `system` 偏好用 `@media` 包住深色规则，而不是先解析成 light——这样系统切换时无需 JS 也能响应。

实现 A 的 `index.html` 同样内联了 `:root` 启动变量（`--startup-background`、`--startup-logo-shimmer-*`）和启动骨架屏样式，防止 logo 闪烁。

## 3. 运行时切换

实现 B 的 `ThemePresenter.apply(snapshot)` 顺序（源码）：

```ts
document.documentElement.style.colorScheme = snapshot.active.colorScheme
document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, preference === 'system' ? 'system' : scheme)
// 深色属性
if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '') else body.removeAttribute(DARK_ATTRIBUTE)
// 字号（三档）
for (const [role, name] of Object.entries(FONT_SIZE_VARIABLES)) body.style.setProperty(name, `${snapshot.fontSizes[role]}px`)
// 字体族（空值则移除，回落到默认栈）
for (const [kind, name] of Object.entries(FONT_FAMILY_VARIABLES)) { ... }
// 主题 token（第三方/扩展主题）
for (const [name, value] of Object.entries(snapshot.active.tokens)) body.style.setProperty(name, value)
// 最后同步 theme-color meta
refreshThemeColor()
```

三个细节值得抄：

| 细节 | 原因 |
|---|---|
| 先清空上次写入的 token 再写新的（`appliedTokens` 记录） | 换主题时旧 token 不会残留 |
| `color-scheme` 写在 `documentElement.style`，不在 body | 影响滚动条、表单控件、原生弹窗 |
| `theme-color` meta 从 `getComputedStyle(body).backgroundColor` 取 | 保证与真实渲染一致，避免手写色值漂移 |

另外 `start()` 里用 `MutationObserver` 监听 `<head>` 的 `<style>` 增删，样式表替换后重新同步主题色——这是"主题 token 由运行时注入"的必然代价。

## 4. 可配置项对比

| 可配置 | 实现 A | 实现 B |
|---|---|---|
| 浅/深/跟随系统 | ✅ | ✅ |
| 正文字号 | ❌（整体缩放由系统 DPI 承担） | ✅ 10–22px |
| 代码字号 | ❌ | ✅ 10–16px |
| 终端字号 | ❌ | ✅ 10–20px |
| 文本字体族 | ❌ | ✅ 自定义列表 |
| 代码字体族 | ❌ | ✅ |
| 终端字体族 | ✅（终端内设置） | ✅ |
| 圆角整体缩放 | ✅ `--corner-radius-scale` | ❌（固定 + 超椭圆） |
| 第三方主题包 | ✅ `--app-color-*` 覆盖 | ✅ `ThemeSnapshot.tokens` 注入 |

## 5. 平台与材质降级

| 场景 | 处理 |
|---|---|
| macOS 原生 vibrancy | 菜单透明不可靠 → `html[data-platform='darwin']` 下改 0.94 近不透明 |
| 无 `corner-shape` 支持 | 自动回退圆弧（特性查询天然降级） |
| 无 `light-dark()` 支持 | 需 prepend fallback 或构建期展开为两套变量 |
| Windows 高对比模式 | 主题变量应让位给 `forced-colors`；焦点环保持可见 |
| 窗口拖拽区 | `-webkit-app-region: drag` 只加在标题栏；浮层内元素要 `no-drag`（实现 B Tooltip 内有该声明） |

## 6. 落地建议

1. **先定"主题源"与"主题态"两个概念**，不要合并成一个变量。
2. 首屏必须内联：背景色、字号、字体族、`color-scheme`，四样缺一就会闪。
3. 若主题数 > 2 或需要换肤，用两层变量表；否则用 `light-dark()`。
4. 所有"由 JS 写到 `body.style` 的 token"都要记录并能在切换时清除。
5. `theme-color` 从计算样式取，不要手写。
6. 玻璃、圆角、超椭圆、字体四类都要有降级分支，且降级按平台/能力探测，不按 UA。
