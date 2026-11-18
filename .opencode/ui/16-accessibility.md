# 16 · 可访问性

## 1. 焦点可见性与输入设备

素材实测的机制，可直接照搬：

```css
:root { --focus-width: 2px; }

/* 全局默认：键盘用户始终能看见环 */
:focus-visible {
  outline-color: var(--c-border-focus);
  outline-width: var(--focus-width);
}

/* 鼠标/触摸操作时不画环，但保留高度与选中边框 */
html[data-input-modality='pointer'] body :focus-visible:not(:read-write) {
  outline-color: transparent;
}
```

三个关键点：

1. **只关闭"环的绘制"**，不关闭 `:focus-visible` 本身，也不关闭选中边框与抬升——否则鼠标点击后元素看起来"没被选中"。
2. **可编辑控件例外**（`:not(:read-write)`）：输入框被点击时仍需明确的焦点反馈。
3. **`--focus-width` 可局部降到 1px**，用于密集表格与工具栏；不能降到 0。

## 2. 焦点管理

| 场景 | 要求 |
|---|---|
| 打开对话框 | 焦点移到第一个可交互元素或标题；关闭后**回到触发元素** |
| 焦点陷阱 | 对话框内 `Tab` 循环，不逃逸到背景 |
| 关闭浮层 | `Esc` 关闭并归还焦点 |
| 删除当前项 | 焦点移到相邻项，不是回到文档开头 |
| 路由切换 | 焦点移到新页面主标题（`tabindex="-1"`），并播报页面名 |
| 侧栏折叠 | 焦点保持在触发的折叠按钮上 |

**焦点归还失败是最常见的可访问性缺陷**：用户关掉对话框后按 Tab 会从页面顶部重新开始。

## 3. 属性驱动的状态

素材里实际使用的 ARIA 属性（按频次）：

| 属性 | 用途 | 对应的样式钩子 |
|---|---|---|
| `aria-expanded` | 展开/收起（32 处） | 箭头旋转、面板显隐 |
| `aria-disabled` | 禁用但保持可聚焦（10） | `opacity: .4`，不阻断焦点 |
| `aria-pressed` | 切换按钮（7） | 按下态填充 |
| `aria-selected` | Tab / 选项选中（6） | 指示器位置 |
| `aria-invalid` | 校验失败（6） | 边框转 error |
| `aria-checked` | 开关 / 复选（5） | 轨道与滑块位置 |
| `aria-current` | 当前页/当前项 | 侧栏选中底色 |
| `aria-haspopup` | 触发浮层 | 右侧箭头 |
| `aria-hidden` | 装饰元素 | 图标默认加 |

规则：**样式挂在语义属性上，不挂并行 class**。这样"看起来的状态"与"读屏读到的状态"不可能不一致。

`aria-disabled` 与 `disabled` 的选择：需要让用户聚焦后知道"为什么不能操作"时用 `aria-disabled`（仍可聚焦）；纯装饰性禁用用原生 `disabled`。

## 4. 角色与语义

| 需求 | 首选 | 不要 |
|---|---|---|
| 按钮 | `<button>` | `<div role="button">` |
| 开关 | `<button role="switch" aria-checked>` | 自定义 class 切换 |
| 对话框 | `<dialog>` 或 `role="dialog" aria-modal="true"` | `<div>` + 遮罩 |
| 列表 | `<ul>/<li>` | 一串 `<div>` |
| 页签 | `role="tablist"/"tab"/"tabpanel"` | 只有视觉指示器 |
| 折叠区 | `<details>` 或 `aria-expanded` + `aria-controls` | 只改高度 |
| 进度 | `<progress>` 或 `role="progressbar"` + `aria-valuenow` | 纯动画 |

原生元素优先，因为在 Windows 高对比模式、屏幕阅读器、移动端手势上都免费获得正确行为。

## 5. 可读文本

| 元素 | 要求 |
|---|---|
| 图标按钮 | `aria-label`（或可见文字），**不用 `title`** |
| 装饰图标 | `aria-hidden="true"` |
| 图片 | 有信息给 `alt`，纯装饰给 `alt=""` |
| 表单字段 | `<label for>` 关联；占位符不能替代标签 |
| 错误提示 | `aria-describedby` 关联到控件 |
| 动态结果 | `aria-live="polite"`（保存成功、搜索结果数）；紧急用 `assertive`（仅错误） |
| 加载中 | `role="status"` + 文本"正在加载" |

**占位符不是标签**：输入后占位符消失，读屏用户在填写时失去字段含义。

## 6. 对比度

| 内容 | 最低 | 建议 |
|---|---|---|
| 正文（< 18px） | 4.5:1 | 7:1 |
| 大文本（≥ 18px 或 14px 粗体） | 3:1 | 4.5:1 |
| 图标、边框、焦点环 | 3:1 | 4.5:1 |
| 禁用态 | 不要求 | 但需可辨"存在" |
| 占位符 | 4.5:1 | — |

素材里终端模拟器显式设置 `minimumContrastRatio: 4.5`，这是正确做法：**颜色由主题给，但渲染层要有对比度兜底**。

## 7. 缩放与高对比

| 场景 | 要求 |
|---|---|
| 200% 缩放 | 不出现横向滚动（除数据表）；不裁切文字 |
| 仅文字放大 | 用 rem/em 或字号轴，不要固定 px 高度撑死内容 |
| `forced-colors: active` | 主题色让位系统色；边框与焦点环保留 |
| 最小触摸目标 | 24×24（WCAG 2.2 AA） |

高对比模式下 `box-shadow` 描边会消失，因此**关键边界不能只靠阴影**，需保留真实 `border` 或 `outline`。

## 8. 落地规则

1. 焦点环用 `:focus-visible` + 2px；密集区域可降到 1px，不可为 0。
2. 关闭对话框必须归还焦点；删除当前项后焦点移到相邻项。
3. 状态样式挂 `aria-*`，不挂并行 class。
4. 原生元素优先；自定义控件补全 role 与键盘行为。
5. 图标按钮必有可读名；装饰图标 `aria-hidden`。
6. 正文对比度 ≥ 4.5:1，边框/图标 ≥ 3:1。
7. 高对比模式下列表边界仍需可见（保留真实 border）。
8. 200% 缩放不产生横向滚动与文字裁切。
