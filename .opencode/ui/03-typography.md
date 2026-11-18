# 03 · 排版系统

## 1. 字号阶梯对照

| 用途 | 实现 A | 实现 B |
|---|---|---|
| 最小标注 | `--font-text-3xs` ≈ 11px | `xxxs-11` `11px/14px` |
| 元信息 | `--text-xs` `12px` | `xxs-12` `12px/18px` |
| 次要 UI | `--font-text-xs` ≈ 13px | `xs-13` `13px/20px` |
| **UI 默认** | `--text-sm` **14px**（1703 次引用） | `s-14` **14px/22px** |
| 正文/内容 | `--text-base` `16px` | `base-16` `16px/24px` |
| 小标题 | `--text-lg` `18px` | `m-18` `16px/28px`（字重 500） |
| 章节标题 | `--font-heading-md/sm` | `l-20` `20px/28px` |
| 页面标题 | `--font-heading-lg/xl/2xl` | `xl-24` `24px/32px` |

两侧都**没有**超过 24px 的常规 UI 字号；更大的尺寸只出现在空状态插图和引导页。

## 2. 实现 B 的动态字号轴（本文最值得借鉴的机制）

实现 B 的字号不是一个固定阶梯，而是围绕**用户设置的正文字号**整体缩放：

```css
/* 用户设 14px → delta = 0；设 18px → delta = 4px */
--content-font-delta: calc(var(--content-font-size) - 14px);

/* 所有标题都用 delta 偏移，标题与正文的相对关系保持恒定 */
font: 700 calc(21px + var(--content-font-delta)) / calc(30px + var(--content-font-delta)) var(--font-family);
```

三个可调角色：

| 角色 | 设置字段 | body 变量 | 范围 | 默认 |
|---|---|---|---|---|
| 正文 | `fontSize` | `--content-font-size` | 10–22px | 14px |
| 代码 | `codeFontSize` | `--code-font-size` | 10–16px | 11px |
| 终端 | `terminalFontSize` | `--terminal-font-size` | 10–20px | 13px |

派生变量：`--content-font-delta`、`--content-font-size-secondary`（`min(size-1, max(13px, size-2))`）、`--code-font-delta`。
值由 `theme-presenter.ts` 写到 `body.style`，并在 `boot-theme.ts` 里于首屏脚本注入，避免闪跳。

> **为什么值得抄**：桌面客户端用户会长期盯着屏幕，字号可调是刚需。若把所有字号写成固定 px，"调到 18px 后标题比正文还小"这类 bug 必然出现。用 delta 偏移一次性解决。

实现 A 侧没有等价的联动机制，字号通过 工具类框架 固定档位；`--corner-radius-scale` 是它唯一的"全局缩放因子"。

## 3. Markdown / 富文本阶梯（实现 B）

| 档 | 字号 | 字重 | 行高 |
|---|---|---|---|
| `markdown-h1` | 21 + delta | 700 | 30 + delta |
| `markdown-h2` | 19 + delta | 700 | 28 + delta |
| `markdown-h3` | 18 + delta | 700 | 26 + delta |
| `markdown-h4` | 14（正文） | 600 | 24 + delta |
| `markdown-base` | 14 | 400 | 24 + delta |
| `markdown-base-strong` | 14 | 600 | 24 + delta |
| `markdown-small` | 12 | 400 | 20 |
| `markdown-code` | 12 + codeDelta | 400 | 19 + codeDelta |
| `markdown-code-block` | 11 | 400 | 19 + codeDelta |
| `markdown-table` | 13 | 400 | 22 |

注意阶梯比例：21 / 19 / 18 是**约 0.9 递减**，不是 1.25 或 1.333 的数学级数——对话框内标题层级差异要小，避免视觉跳动。

## 4. 字重

| | 实现 A | 实现 B |
|---|---|---|
| 常规 | 400 | 400 |
| 中 | **510** | 500 |
| 半粗 | **590** | 600 |
| 粗 | 700 | 700 |
| 可用 | `--font-weight-light 300` | — |

实现 A 的 510 / 590 属于可变字体（可变字体插值档）的插值档，视觉上比 500/600 更细腻；但**缺少该字体时会回退到 500/600**，跨平台渲染不一致。实现 B 用标准档位，可预测性更强。

> 建议：产品若不自带可变字体，用 400 / 500 / 600 / 700 四档；若自带，可用 510 / 590，但必须同时定义 fallback 字体族与 `font-synthesis`。

## 5. 字体族

### 实现 B

```
文本: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
      'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif
代码: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono',
      Menlo, Courier, 'PingFang SC', 'Microsoft YaHei'
品牌: '品牌字体' + 文本栈（300/400/500 三档 woff2）
```

两条代码注释值得记录：

1. **代码字体刻意不带裸 `monospace`** —— 否则 Windows 中文会回退到 SimSun（宋体），出现中英混排断裂。
2. 用户自定义字体通过 `--font-family-{text,code,terminal}` 注入 `body.style`，文本栈写成 `var(用户值, 默认值), 默认值`，保证用户值只影响首选、不影响兜底。

### 实现 A

- 未暴露字体族 token（被 工具类框架 / 平台默认吸收），代码块强制 `font-family: var(--font-mono) !important`。
- 通过 `@font-face` 引入 131 个字体声明、67 个字体文件（含品牌字体与多语言子集）。

## 6. 行高

| 字号 | 实现 A | 实现 B |
|---|---|---|
| 11 | — | 14（1.27） |
| 12 | 18（1.5） | 18（1.5） |
| 13 | 20（1.54） | 20（1.54） |
| 14 | 22（1.57） | 22（1.57） |
| 16 | 24（1.5） | 24（1.5） |
| 18 | — | 28（1.56） |
| 20 | — | 28（1.4） |
| 24 | 32（1.33） | 32（1.33） |

**UI 文本 1.5 左右，标题随字号增大而收紧到 1.33。** 两套系统在 12/13/14/16/24 上完全一致，可直接作为默认行高表。

## 7. 落地规则

1. UI 外壳统一 13–14px，正文区 14px（可选 16px），只有空状态/引导页用 20px+。
2. 行高不用 `normal`，全部显式声明；中文界面 14px 配 22px 是安全组合。
3. 若支持字号调整，用 `calc(px + delta)` 而不是换整套档位。
4. 代码字体族不要以 `monospace` 结尾（Windows 中文回退问题）。
5. 字重不超过 700；正文加粗用 600，标题用 700，不要用 800/900。
6. 数字密集处（图表、计数器、终端）开 `font-variant-numeric: tabular-nums`，避免宽度跳动。
