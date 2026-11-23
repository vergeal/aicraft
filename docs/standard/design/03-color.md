# 03 · 色彩

## 1. 色彩哲学

界面的颜色由**层级**决定，不由品牌决定。中性色承担结构与阅读，强调色只回答"现在轮到谁"。

面积配额（视觉面积，不是代码统计）：

| 类别 | 占比 | 内容 |
| --- | --- | --- |
| 中性 | 90% | 画布、表面、文字、边框 |
| 强调 | 5% | 选中、焦点、当前项、主要操作 |
| 状态 | 5% | 成功、警告、危险、信息 |

任何一屏如果品牌色面积超过 10%，即为不合格。

## 2. 三层色板

```
原始层  --v2-grey-* / --v2-blue-* / --v2-alpha-*
   ↓  只允许语义层引用
语义层  --v2-background-* / --v2-text-* / --v2-icon-* / --v2-border-* / --v2-state-*
   ↓  组件只允许引用这一层
组件层  组件内的私有变量（--_field-inset 等）
```

## 3. 语义色使用规则

### 3.1 背景

| 场景 | 令牌 |
| --- | --- |
| 窗口画布 | `--v2-background-bg-base` |
| 侧栏、导航列 | `--v2-background-bg-deep` 或玻璃材质 |
| 卡片、输入框 | `--v2-background-bg-base`（在 canvas 上）/ `bg-layer-01` |
| 悬浮块、选中行 | `bg-layer-02` / `bg-layer-03` |
| 主按钮 | `--v2-background-bg-contrast` |
| 次要按钮 | `--v2-background-bg-button-neutral` |

**禁止**：用 `bg-layer-*` 给整个页面铺底；分层只用于"在某个表面之上"的块。

### 3.2 文字

四档，只允许四档：

| 档位 | 令牌 | 用于 | 禁止用于 |
| --- | --- | --- | --- |
| 主 | `text-text-base` | 标题、正文、当前项 | 辅助说明 |
| 次 | `text-text-muted` | 说明、描述、次级标签 | 长正文（对比度仅 4.5） |
| 弱 | `text-text-faint` | 元数据、占位符、时间戳 | 任何需要阅读的句子 |
| 反 | `text-text-inverse` / `contrast` | 深色底、黑白按钮内 | 浅底 |

同一个信息块内文字档位不超过 3 种。

### 3.3 图标与边框

- 图标默认 `icon-base`；导航、工具条用 `icon-muted`；禁用与装饰用 `icon-faint`。
- 边框三档：弱 `border-muted`（8%）用于分组；默认 `border-base`（10%）用于控件边界；强 `border-strong`（20%）用于需要明确分隔的容器。
- 0.5px 发丝边只用 `border-base`；1px 分隔线只用 `border-muted`。

## 4. 状态色

| 状态 | 背景 | 文字 / 图标 | 边框 | 使用场景 |
| --- | --- | --- | --- | --- |
| 成功 | `state-bg-success` | `state-fg-success` | `state-border-success` | 保存成功、任务完成 |
| 警告 | `state-bg-warning` | `state-fg-warning` | `state-border-warning` | 将影响数据的操作 |
| 危险 | `state-bg-danger` | `state-fg-danger` | `state-border-danger` | 错误、删除、不可恢复 |
| 信息 | `state-bg-info` | `state-fg-info` | `state-border-info` | 中性提示、新功能 |

规则：

1. 状态色必须以"底 + 文字 + 图标"三者组合出现，不能只用文字变色。
2. 成功态不做永久绿色装饰，展示一次后回到中性。
3. 错误必须附带下一步操作（重试、修改、联系）。
4. 禁止把状态色当作强调色使用（例如用绿色做主按钮）。

## 5. 强调色：系统色与品牌色

| 角色 | 令牌 | 用途 |
| --- | --- | --- |
| 交互强调 | `--v2-system-accent`（`#007aff`） | 焦点环、选中、当前项、链接 |
| 品牌 | `--v2-blue-600` 等品牌蓝 | Agent 标记、语法高亮、插图，不参与交互态 |

规则：

- 焦点环与选中态使用系统强调色，跟随 macOS 用户设置。
- 品牌色不用于按钮填充、边框、图标底色。
- 同一界面只允许一个强调色相；不允许蓝紫混用。

## 6. 深浅主题

### 6.1 实现

```css
:root { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; }
}
```

- 用户偏好与解析结果分开记录：`data-theme-source` = `system | light | dark`，`data-theme` 只写解析后的结果。
- 深色不是浅色的反相：深色画布用 `#161616`，不是纯黑；边框透明度提高 4–6 个百分点；阴影 alpha 提高约 2 倍。

### 6.2 深色取值

| 项 | 浅色 | 深色 |
| --- | --- | --- |
| 画布 | `#ffffff` / `#fafafa` | `#161616` |
| 表面 | `#ffffff` | `#242424` |
| 主文字 | `#161616` | `#f2f2f2` |
| 次文字 | `#5c5c5c` | `#c2c2c2` |
| 弱文字 | `#808080` | `#8f8f8f` |
| 边框 | 黑 10% | 白 12–16% |
| 阴影 alpha | 0.04–0.12 | 0.2–0.4 |

### 6.3 首屏防闪

必须在 `<head>` 内联，四样缺一不可：

1. `color-scheme`
2. 背景色（`html` 与 `body`）
3. 字体族与正文字号
4. 启动骨架的底色

```html
<style>
  html { color-scheme: light; background: #fff; }
  @media (prefers-color-scheme: dark) {
    html:not([data-theme="light"]) { color-scheme: dark; background: #161616; }
  }
</style>
```

## 7. 对比度

| 内容 | 最低 |
| --- | --- |
| 正文 | 4.5:1 |
| 大字号（≥18px 或 14px 粗体） | 3:1 |
| 图标（功能性） | 3:1 |
| 边框（区分控件） | 3:1 |
| 禁用态 | 不要求，但必须能看出"不可用" |

玻璃表面上的文字按玻璃后面的最坏背景计算，不按表面自身颜色计算。

## 8. 禁止

- 组件内写 `#hex` / `rgb()`。
- 用透明度表达"禁用"（必须同时降低对比度并移除交互）。
- 用颜色单独表达状态（必须配图标或文案）。
- 在深色下使用纯黑 `#000` 作为背景。
- 在浅色下使用纯白文字（除黑白按钮内）。
- 用多层半透明叠加制造"更深的灰"（应直接用更高一档色阶）。
