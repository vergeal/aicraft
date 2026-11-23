# 02 · 设计令牌

令牌是规范的执行层：所有视觉数值只从这里取。组件里出现裸值（`#fff`、`14px`、`8px` 圆角）即为不合格。

## 1. 命名与分层

```
--v2-{原始}:  色阶与尺寸，不带语义        （v2-grey-700、v2-blue-600）
--v2-{组}-{项}: 语义，唯一对外 API        （v2-text-text-muted、v2-border-border-base）
--_{私有}:    组件内部计算，不对外        （_composer-inset）
```

规则：

1. 组件只能引用语义层。原始层只允许在语义层定义处出现。
2. 语义名只描述用途，不描述颜色。禁止 `--red-button`、`--orange-highlight`。
3. 一个用途只有一个语义名。已有可覆盖的用途时，不允许新增近似 token。

## 2. 色阶

中性色（两套主题共用的原始值）：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--v2-grey-50` | `#ffffff` | 画布、卡片、输入底色（浅色） |
| `--v2-grey-100` | `#fafafa` | 画布下一档、次级面板 |
| `--v2-grey-200` | `#f2f2f2` | 分层 2、hover 底 |
| `--v2-grey-300` | `#eeeeee` | 分层 3、选中底 |
| `--v2-grey-400` | `#dbdbdb` | 深色描边辅助 |
| `--v2-grey-500` | `#aeaeae` | 最弱图标 |
| `--v2-grey-600` | `#808080` | 弱文字、次级图标 |
| `--v2-grey-700` | `#5c5c5c` | 次文字 |
| `--v2-grey-800` | `#3a3a3a` | 图标、深色分层 |
| `--v2-grey-900` | `#2e2e2e` | 深色浮层底 |
| `--v2-grey-1000` | `#242424` | 深色反相底 |
| `--v2-grey-1100` | `#161616` | 主文字（浅色） |
| `--v2-grey-1200` | `#080808` | 极少用，阴影端点 |

透明度：`--v2-alpha-dark-4 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 40` 分别对应 4% / 8% / 10% / 12% / 14% / 16% / 20% / 24% / 40% 黑。深色下对应使用 `--v2-alpha-light-*` 白。

状态色族：`red / green / yellow / blue / purple / pink / cyan`，每族 100–900。只允许通过语义状态色引用，不允许组件直接用 `--v2-red-500`。

## 3. 语义色

### 3.1 背景

| 令牌 | 语义 | 典型位置 |
| --- | --- | --- |
| `--v2-background-bg-base` | 默认画布 | 窗口内容区、输入框 |
| `--v2-background-bg-deep` | 下沉一档 | 分组底、侧栏局部 |
| `--v2-background-bg-layer-01..04` | 层叠 1–4 | 卡片、悬浮块、选中块 |
| `--v2-background-bg-inverse` | 反相底 | 深色工具提示 |
| `--v2-background-bg-contrast` | 黑白主按钮底 | 主要操作 |
| `--v2-background-bg-button-neutral` | 中性按钮底 | 次要操作 |
| `--v2-background-bg-accent` | 系统强调底 | 选中、当前项 |

### 3.2 文字

| 令牌 | 语义 | 对比度要求 |
| --- | --- | --- |
| `--v2-text-text-base` | 正文、标题 | ≥ 7:1 |
| `--v2-text-text-muted` | 次要说明 | ≥ 4.5:1 |
| `--v2-text-text-faint` | 元数据、占位符 | ≥ 3:1（不作正文） |
| `--v2-text-text-inverse` | 深底上的文字 | ≥ 4.5:1 |
| `--v2-text-text-contrast` | 黑白按钮上的文字 | ≥ 7:1 |
| `--v2-text-text-accent` | 链接、当前项 | ≥ 4.5:1 |

### 3.3 图标与边框

| 令牌 | 语义 |
| --- | --- |
| `--v2-icon-icon-base` | 默认图标 |
| `--v2-icon-icon-muted` | 次要图标、导航图标 |
| `--v2-icon-icon-faint` | 装饰性图标、禁用 |
| `--v2-icon-icon-accent` | 强调图标 |
| `--v2-border-border-muted` | 弱分隔（8%） |
| `--v2-border-border-base` | 控件边界（10%） |
| `--v2-border-border-strong` | 需要明确边界（20%） |
| `--v2-border-border-focus` | 焦点环（系统强调色） |

### 3.4 交互覆盖与状态

| 令牌 | 语义 |
| --- | --- |
| `--v2-overlay-simple-overlay-hover` | 任意表面 hover（4%） |
| `--v2-overlay-simple-overlay-pressed` | 按下（8%） |
| `--v2-overlay-simple-overlay-scrim` | 弹窗遮罩（40%） |
| `--v2-state-bg-{success,warning,danger,info}` | 状态底 |
| `--v2-state-fg-*` | 状态文字与图标 |
| `--v2-state-border-*` | 状态边框 |

状态色只用于：结果提示、错误、警示、进度。**禁止**用于普通按钮、选中态、装饰。

## 4. 字体令牌

| 令牌 | 值 |
| --- | --- |
| `--font-family-sans` | `"Inter", ui-sans-serif, system-ui, -apple-system, ...` |
| `--font-family-mono` | `"IBM Plex Mono", ui-monospace, SFMono-Regular, ...` |
| `--font-size-xx-small` | 11px |
| `--font-size-x-small` | 12px |
| `--font-size-small` / `base` | 14px |
| `--font-size-large` | 18px |
| `--font-size-x-large` | 20px |
| `--font-weight-regular` | 400 |
| `--font-weight-medium` | 500 |
| `--font-weight-bold` | 600 |
| `--line-height-normal` | 130% |
| `--line-height-large` | 150% |

完整用法见 [04 字体排印](04-typography.md)。

## 5. 间距与尺寸

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--spacing` | 4px | 基准单位，全部间距为它的倍数 |
| 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 | px | 允许的间距阶梯 |
| `--radius-xs` | 4px | 极小标记 |
| `--radius-sm` | 6px | 内嵌控件、小标签 |
| `--radius-md` | 8px | 分组、缩略图 |
| `--radius-lg` | 12px | 卡片、输入区、浮层 |
| `--radius-popover` | 12px | 菜单、Popover |
| `--radius-xl` | 16px | 大卡片、Toast |
| 20 / 24 / 28 | px | composer 多行 / 弹窗 / 面板 |
| `999px` | 胶囊 | 单行输入、标签、头像、状态点 |

## 6. 层级与材质

| 令牌 | 值 |
| --- | --- |
| `--v2-elevation-raised` | `0 2px 4px rgba(0,0,0,.04), 0 1px 2px -1px rgba(0,0,0,.08), 0 0 0 .5px rgba(0,0,0,.12)` |
| `--v2-elevation-floating` | `0 8px 16px rgba(0,0,0,.04), 0 4px 8px rgba(0,0,0,.08), 0 0 0 .5px rgba(0,0,0,.12)` |
| `--v2-elevation-overlay` | `0 16px 32px rgba(0,0,0,.04), 0 8px 16px rgba(0,0,0,.08), 0 0 0 .5px rgba(0,0,0,.12)` |
| `--v2-elevation-input` | `0 1px 1.5px rgba(0,0,0,.10), 0 0 0 .5px rgba(0,0,0,.14)` |
| `--v2-elevation-button-neutral` | 同 input 的浅一档 |
| `--v2-material-blur-regular` | `blur(20px) saturate(180%)` |
| `--v2-material-blur-thick` | `blur(30px) saturate(180%)` |
| `--v2-material-surface` | `grey-50 72%` |
| `--v2-material-surface-strong` | `grey-50 64%` |

五级层级与使用条件见 [07 层级与材质](07-elevation-material.md)。

## 7. 动效

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| 85ms | `ease-out` | 悬停、颜色、边框 |
| 120ms | `ease` | 图标位移、开关 thumb |
| 150ms | `ease-out` | 默认过渡、卡片 hover |
| 160ms | `ease-out` | 分段指示器、面板淡入 |
| 180ms | `ease-out` | 弹层入场 |
| 220ms | `cubic-bezier(.2,0,0,1)` | 侧栏、抽屉展开 |
| 260ms | `cubic-bezier(.22,1,.36,1)` | 布局转换 |
| 300ms | `ease-in-out` | 页面级切换（上限） |

曲线只允许三条：`ease`、`ease-out`、`cubic-bezier(.22,1,.36,1)`。见 [13 动效](13-motion.md)。

## 8. 层级（z-index）

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--z-base` | 0 | 内容 |
| `--z-sticky` | 10 | 顶栏、吸顶工具条 |
| `--z-drawer` | 20 | 右侧面板、抽屉 |
| `--z-overlay` | 50 | 弹窗遮罩与弹窗 |
| `--z-popover` | 60 | 菜单、Popover、Tooltip |
| `--z-toast` | 70 | Toast |

组件内不允许出现常量 z-index；浮层一律用上表。

## 9. 布局常量

| 令牌 | 值 |
| --- | --- |
| `--titlebar-height` | 48px |
| `--titlebar-axis` | 22px（红绿灯中线） |
| `--navigation-sidebar-width` | 280px |
| `--sidebar-row-height` | 29px |
| `--sidebar-section-height` | 25px |
| `--conversation-content-max-width` | 650px |
| `--workspace-content-max-width` | 820px |
| `--composer-max-width` | 650px |
| `--composer-height` | 88px |
| 表单内容宽 | 480 / 640px |
| 设置内容宽 | 760px |

完整布局规则见 [08 布局](08-layout.md)。

## 10. 禁止

- 在组件里写 `#hex`、`rgb()`、裸 `px` 字号、裸 `px` 圆角。
- 用 `!important` 覆盖令牌。
- 新增与现有语义重叠的 token（例如已有 `-muted` 再加 `-secondary`）。
- 跨层引用：组件不得直接使用 `--v2-grey-*` 或状态色原始值。

新增令牌前先过 [19 治理](19-governance.md) 的四问。
