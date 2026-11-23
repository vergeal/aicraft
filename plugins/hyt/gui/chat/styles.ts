/**
 * 聊天主界面的样式。
 *
 * 插件源码不在应用的 Tailwind 扫描范围内，所以用 CSS 字符串注册。颜色、字号、间距、圆角全部引用
 * `docs/standard/design` 对应的语义变量，深浅色由变量自己跟随主题，不写死任何色值。
 *
 * 骨架照设计图 `docs/standard/design/prototypes/hyt-chat.html` 1:1：
 * 左侧 280 会话栏（常驻搜索 + 「会话」标题行 + 群会话 + 「私人会话」分组），
 * 中间聊天（56 会话头 + 760 消息列 + 88 输入卡）。顶栏与模块导航由宿主提供，这里不重复画。
 *
 * 数值出处就近标在注释里：字号 04 §2、间距 05 §1、控件高 05 §3、圆角 06 §1–2、
 * 侧栏列宽 08 §3、消息列 08 §4、输入卡 09 §13、列表行与徽标 09 §11。
 */
export const css = `
/* ============================================================================
   0 · 骨架
   ========================================================================= */
.hyt-chat {
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--hyt-bg-chat);
  color: var(--hyt-text);
  font-size: var(--hyt-text-13);
  line-height: var(--hyt-lh-normal);
  -webkit-font-smoothing: antialiased;
}

/* 侧栏比聊天亮一档：layer-01 对 base，深浅两套主题都成立。 */
.hyt-chat-side {
  display: flex;
  flex-direction: column;
  flex: 0 0 280px;
  min-width: 0;
  min-height: 0;
  background: var(--hyt-bg-side);
  box-shadow: inset calc(-1 * 0.5px) 0 0 0 var(--hyt-line);
}
.hyt-chat-main {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: var(--hyt-bg-chat);
}

/* 配色全部走语义 token（设计规范的 --v2-*），深浅色由宿主主题切换，页面自己不做颜色决策。
   这里只做一层别名，组件规则只引用 --hyt-*，不再出现任何色值。 */
.hyt-chat {
  /* 左栏压暗一档、中栏抬亮一档：浅色下是「微灰栏 + 白频道」，深色下是「更暗栏 + 抬亮的频道」，
     消息区不再和侧栏糊成一整块。 */
  --hyt-bg-side: light-dark(
    color-mix(in srgb, var(--v2-background-bg-deep) 55%, var(--v2-background-bg-layer-01)),
    var(--v2-background-bg-base)
  );
  --hyt-bg-chat: light-dark(var(--v2-background-bg-base), var(--v2-background-bg-layer-01));
  --hyt-bg-elev: var(--v2-background-bg-layer-02);
  /* 气泡与输入卡同档（图上的 layer-01），卡内子卡再抬一档：浅色比气泡亮，深色也比气泡亮。 */
  --hyt-bg-bubble: light-dark(var(--v2-background-bg-layer-01), var(--v2-background-bg-layer-02));
  --hyt-bg-card: light-dark(var(--v2-background-bg-base), var(--v2-background-bg-layer-03));
  /* 右栏自成一层：底用 base，次级按钮 layer-02、工具行 layer-01，悬停各抬一档。 */
  --hyt-bg-info: var(--v2-background-bg-base);
  --hyt-bg-row: var(--v2-background-bg-layer-01);
  --hyt-bg-row-hover: var(--v2-background-bg-layer-03);
  --hyt-line: var(--v2-border-border-muted);
  --hyt-line-strong: var(--v2-border-border-base);
  --hyt-text-body: var(--v2-text-text-base);
  --hyt-text: var(--v2-text-text-base);
  --hyt-text-strong: var(--v2-text-text-base);
  --hyt-text-2: var(--v2-text-text-muted);
  --hyt-text-3: var(--v2-text-text-faint);
  --hyt-on-accent: var(--v2-grey-50);
  --hyt-accent: var(--v2-background-bg-accent);
  --hyt-accent-hover: var(--v2-background-bg-accent-hover);
  --hyt-accent-soft: color-mix(in srgb, var(--v2-background-bg-accent) 12%, transparent);
  --hyt-accent-faint: color-mix(in srgb, var(--v2-background-bg-accent) 10%, transparent);
  --hyt-accent-line: color-mix(in srgb, var(--v2-background-bg-accent) 32%, transparent);
  --hyt-accent-ink: var(--v2-text-text-accent);
  --hyt-green: var(--v2-state-fg-success);
  --hyt-red: var(--v2-state-fg-danger);
  --hyt-yellow: var(--v2-state-fg-warning);
  --hyt-danger: var(--v2-state-fg-danger);
  --hyt-surface-raised: var(--v2-background-bg-layer-02);
  --hyt-surface-hover: var(--v2-overlay-simple-overlay-hover);
  --hyt-surface-active: var(--v2-overlay-simple-overlay-pressed);
  --hyt-hover: var(--v2-overlay-simple-overlay-hover);
  --hyt-active: var(--v2-overlay-simple-overlay-pressed);
  --hyt-scrim: var(--v2-overlay-simple-overlay-scrim);
  --hyt-shadow-float: var(--v2-elevation-floating);
  /* 卡片与输入卡的浮起高度：图上靠这一档阴影分层，不额外压底色。 */
  --hyt-shadow-input: var(--v2-elevation-input);
  --hyt-focus-ring: var(--v2-focus-ring-color);
  --hyt-focus-width: var(--focus-width, 2px);
  /* 主操作键：图上发送键是强调底 + 白字。accent 蓝不随主题变，所以字色也固定取白，
     用 --v2-text-text-contrast 的话深色主题会给出黑字，蓝底黑字对比不足。 */
  --hyt-key-bg: var(--v2-background-bg-accent);
  --hyt-key-fg: var(--v2-grey-50);
  /* 字号收敛到设计规范的四档：11 元信息 / 12 次级 / 13 次要 UI / 14 正文。 */
  --hyt-text-10: 11px;
  --hyt-text-11: 11px;
  --hyt-text-125: 12px;
  --hyt-text-13: 13px;
  --hyt-text-135: 14px;
  --hyt-text-14: 14px;
  --hyt-lh-normal: 1.45;
  --hyt-lh-large: 1.5;
  --hyt-radius-4: 4px;
  --hyt-radius-6: 6px;
  --hyt-radius-8: 8px;
  --hyt-radius-10: 10px;
  --hyt-radius-12: 12px;
  --hyt-radius-16: 16px;
  /* 消息气泡：对方用浮层色，自己用强调色的浅染——图上两枚气泡都是可读的深字，不反相。 */
  --hyt-bubble: var(--hyt-bg-bubble);
  --hyt-bubble-self: color-mix(in srgb, var(--hyt-accent) 12%, var(--hyt-bg-bubble));
  --hyt-bubble-self-ink: var(--hyt-text-body);
}
/* ============================================================================
   1 · 左栏：常驻搜索 + 标题行
   ========================================================================= */
/* 搜索区上下 8/6、左右 12（05 §1），输入控件 28 高（05 §3）。 */
.hyt-chat-searcher {
  flex: 0 0 auto;
  padding: 8px 12px 6px;
}
.hyt-chat-search {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  border-radius: var(--hyt-radius-6);
  background: var(--hyt-bg-card);
  box-shadow: var(--hyt-shadow-input);
  color: var(--hyt-text-3);
  transition:
    box-shadow var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-search:focus-within {
  box-shadow:
    var(--hyt-shadow-input),
    0 0 0 var(--hyt-focus-width) var(--hyt-focus-ring);
}
.hyt-chat-search-icon {
  position: absolute;
  left: 8px;
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--hyt-text-3);
  pointer-events: none;
}
.hyt-chat-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0 20px 0 28px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--hyt-text);
  font: inherit;
  font-size: var(--hyt-text-13);
  line-height: 20px;
}
.hyt-chat-search input::placeholder {
  color: var(--hyt-text-3);
}
.hyt-chat-search input::-webkit-search-cancel-button {
  display: none;
}
/* 快捷键提示贴在输入框内右侧，不占交互。 */
.hyt-chat-search-key {
  position: absolute;
  right: 6px;
  color: var(--hyt-text-3);
  font-family: var(--font-family-mono, inherit);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  pointer-events: none;
}

/* 标题行 44：「会话」13/500 + 未读计数 + 右侧 28 图标（05 §3）。 */
.hyt-chat-side-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 44px;
  padding: 0 12px;
}
.hyt-chat-side-title {
  margin-right: auto;
  color: var(--hyt-text);
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-medium);
  line-height: 20px;
}
.hyt-chat-side-count {
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.hyt-chat-side-count[data-tone="warning"] {
  color: var(--hyt-yellow);
}

/* 筛选不是「全部」时留一个小点，收起菜单也能看出被过滤了。 */
.hyt-chat-icon-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--hyt-accent);
}
.hyt-side-filter {
  position: relative;
  display: flex;
}
.hyt-side-filter-scrim {
  position: fixed;
  inset: 0;
  z-index: 20;
}
.hyt-side-filter-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 21;
  display: flex;
  flex-direction: column;
  min-width: 148px;
  padding: 4px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-line),
    var(--hyt-shadow-float);
}
.hyt-side-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  color: var(--hyt-text);
  font-family: inherit;
  font-size: var(--hyt-text-125);
  text-align: start;
  white-space: nowrap;
  cursor: pointer;
}
.hyt-side-filter-item[aria-checked="true"] {
  color: var(--hyt-accent-ink);
  font-weight: var(--font-weight-bold);
}
.hyt-side-filter-item:disabled {
  opacity: 0.4;
  cursor: default;
}
/* 菜单底部的一键已读：用一条极淡的分隔线跟筛选项隔开，避免误点。 */
.hyt-side-filter-sep {
  height: 0.5px;
  margin: 4px 6px;
  background: var(--hyt-line);
}
@media (hover: hover) {
  .hyt-side-filter-item:hover:not(:disabled) {
    background: var(--hyt-hover);
  }
}
.hyt-side-filter-label {
  flex: 1 1 auto;
}
.hyt-side-filter-count {
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

/* ============================================================================
   2 · 左栏：分组与会话行
   ========================================================================= */
/* 列表左右 6、行内左右 6：文字与头像的左缘落在 12（05 §1）。 */
.hyt-chat-side-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 0 6px 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--hyt-line-strong) transparent;
}

/* 分组标题 11/16/500 + 字距（04 §2.1 侧栏分组标题）。 */
.hyt-chat-side-label {
  padding: 6px 6px 4px;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
  line-height: 16px;
}

.hyt-chat-sessions {
  display: flex;
  flex-direction: column;
}
/* 会话行 64：头像 40 + 名字 20 + 预览 18 + 组内 2（09 §11 双行列表项）。 */
.hyt-chat-session {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 64px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--hyt-radius-8);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color var(--duration-fast, 120ms) var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-chat-session:hover {
    background: var(--hyt-surface-hover);
  }
}
/* 选中 = 淡强调底 + 左缘 2px 指示条，两个信号同时给（08 §3）。 */
.hyt-chat-session[aria-current="true"] {
  background: var(--hyt-accent-faint);
}
@media (hover: hover) {
  .hyt-chat-session[aria-current="true"]:hover {
    background: color-mix(in srgb, var(--hyt-accent) 14%, transparent);
  }
}
.hyt-chat-session[aria-current="true"]::before {
  content: "";
  position: absolute;
  left: -6px;
  top: 12px;
  bottom: 12px;
  width: 2px;
  border-radius: 999px;
  background: var(--hyt-accent);
}
.hyt-chat-session:focus-visible {
  outline: var(--hyt-focus-width) solid var(--hyt-focus-ring);
  outline-offset: -2px;
}
/* 名字与预览在同一列，时间与未读在右列（图上的两列读法）。 */
.hyt-chat-session-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-chat-session-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: 0 0 auto;
}
/* 会话名 14/20/400，当前项与未读提到 500（04 §2.1）。 */
.hyt-chat-session-name {
  min-width: 0;
  overflow: hidden;
  font-size: var(--hyt-text-14);
  font-weight: var(--font-weight-regular);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hyt-text);
}
.hyt-chat-session[aria-current="true"] .hyt-chat-session-name,
.hyt-chat-session[data-unread="true"] .hyt-chat-session-name {
  color: var(--hyt-text-strong);
  font-weight: var(--font-weight-medium);
}
.hyt-chat-session-preview {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-session[data-unread="false"] .hyt-chat-session-preview {
  color: var(--hyt-text-3);
}
.hyt-chat-session-time {
  flex: 0 0 auto;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.hyt-chat-session[aria-current="true"] .hyt-chat-session-time,
.hyt-chat-session[data-unread="true"] .hyt-chat-session-time {
  color: var(--hyt-text-2);
}
/* 未读徽标 16 高胶囊，状态红（09 §11 Badge）。 */
.hyt-chat-badge {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--hyt-danger);
  color: var(--hyt-on-accent);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
/* 被人 @ 到时换成警示色，形状与徽标一致（图上的 mention 档）。 */
.hyt-chat-badge[data-tone="mention"] {
  background: var(--hyt-yellow);
  color: var(--hyt-on-accent);
}
.hyt-chat-hint {
  margin: 8px 6px;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
}

/* ============================================================================
   3 · 通用控件：图标按钮、头像
   ========================================================================= */
/* 图标按钮：全页唯一的图标交互形态，标题行、会话头、工具行、文件卡都用它（09 §1）。 */
.hyt-chat-icon {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  color: var(--hyt-text-2);
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    color var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-icon svg {
  width: 16px;
  height: 16px;
}
.hyt-chat-icon:focus-visible {
  outline: var(--hyt-focus-width) solid var(--hyt-focus-ring);
  outline-offset: 1px;
}
.hyt-chat-icon[aria-pressed="true"] {
  background: var(--hyt-active);
  color: var(--hyt-text);
}
/* 没有未读时置灰：这个位置常驻，灰掉比消失更好找。 */
.hyt-chat-icon:disabled {
  opacity: 0.35;
  cursor: default;
}
@media (hover: hover) {
  .hyt-chat-icon:hover:not(:disabled) {
    background: var(--hyt-hover);
    color: var(--hyt-text);
  }
}

/* 头像：真人圆形，群与机器人与系统账号是 10 圆角的容器（06 §4 形状区分身份）。
   尺寸由组件按档写进 style：会话行 40、消息 36、会话头 32。 */
.hyt-chat-avatar {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  color: var(--hyt-on-accent);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  isolation: isolate;
  transform: translateZ(0);
  backface-visibility: hidden;
}
.hyt-chat-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* 群头像：灰底容器里按 1/2/3/4/5+ 的布局摆成员小方块。容器底色由组件设为虹云通的 GROUP_HEAD_BG。 */
.hyt-chat-avatar[data-stack="true"] {
  align-items: stretch;
  justify-items: stretch;
}
.hyt-chat-avatar-tile {
  position: absolute;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: var(--hyt-on-accent);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  transform: translateZ(0);
  backface-visibility: hidden;
}
.hyt-chat-avatar-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ============================================================================
   4 · 中栏：会话头
   ========================================================================= */
/* 会话头 56：头像 32 + 名字 14/20/500 + 元信息 11/16，右侧 28 图标（08 §5）。 */
.hyt-chat-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 56px;
  padding: 0 16px;
  box-shadow: inset 0 -0.5px 0 var(--hyt-line);
}
.hyt-chat-head-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-chat-head-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--hyt-text);
  font-size: var(--hyt-text-135);
  font-weight: var(--font-weight-medium);
  line-height: 20px;
}
.hyt-chat-head-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 元信息：单聊给部门，群聊给近期发言人数——只用本地库真的查得到的信息。 */
.hyt-chat-head-meta {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-ai-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--hyt-accent-soft);
  color: var(--hyt-accent-ink);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-medium);
  line-height: 16px;
  white-space: nowrap;
}
.hyt-chat-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

/* ============================================================================
   5 · 中栏：消息流
   ========================================================================= */
.hyt-chat-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 滚动条出现/消失会让内容宽度跳 1~2px，消息一多像是闪了一下；留出固定槽位。 */
  scrollbar-gutter: stable;
  padding: 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--hyt-line-strong) transparent;
}
.hyt-chat-flow {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* 阅读列 760（08 §4）：宽窗口下不贴着两边拉满。 */
  max-width: 760px;
  margin: 0 auto;
}

/* 日期只是一行居中的灰字，不加贯穿的分隔线（图上如此）。 */
.hyt-chat-day {
  display: flex;
  justify-content: center;
  margin: 16px 0 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-regular);
  line-height: 16px;
  white-space: nowrap;
}

/* 一条消息 = 头像 + 内容列；组间 16、组内 4。 */
.hyt-chat-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 16px;
}
/* 搜索结果定位到的那一条：整行短暂亮一下再褪掉。 */
.hyt-chat-item[data-focus="true"] {
  border-radius: var(--hyt-radius-8);
  animation: hyt-chat-focus 1.8s var(--ease-out, ease);
}
@keyframes hyt-chat-focus {
  0%,
  45% {
    background: var(--hyt-accent-soft);
  }
  100% {
    background: transparent;
  }
}
/* 组内后续消息：不重复头像与名字，只留 4px，同一个人连发的紧凑感。 */
.hyt-chat-item[data-first="false"] {
  margin-top: 4px;
}
.hyt-chat-item[data-first="false"] > .hyt-chat-avatar {
  visibility: hidden;
}
.hyt-chat-item-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: 560px;
  flex: 0 1 auto;
}
.hyt-chat-item-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
/* 消息元信息：名字 12/18/500 + 时间 11/16 弱色（04 §2.1）。 */
.hyt-chat-item-name {
  overflow: hidden;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-medium);
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-item-time {
  flex: 0 0 auto;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.hyt-chat-msg-role {
  flex: 0 0 auto;
  max-width: 132px;
  overflow: hidden;
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-msg-role[data-you="true"] {
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line);
  color: var(--hyt-accent-ink);
}
.hyt-chat-at-mark {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  background: color-mix(in srgb, var(--hyt-red) 16%, transparent);
  color: var(--hyt-red);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  line-height: 16px;
}

/* 「以下为新消息」：线 + 文字，一条流里只出现一次强调。 */
.hyt-chat-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  white-space: nowrap;
}
.hyt-chat-divider::before,
.hyt-chat-divider::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: var(--hyt-line);
}

/* 气泡：内边距 8/12、圆角 12，靠头像那一角收到 4（06 §8 气泡例外）。 */
.hyt-chat-bubble {
  max-width: 100%;
  padding: 8px 12px;
  border-radius: var(--hyt-radius-12);
  border-top-left-radius: var(--hyt-radius-4);
  background: var(--hyt-bubble);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  color: var(--hyt-text-body);
  font-size: var(--hyt-text-135);
  line-height: 22px;
  word-break: break-word;
  white-space: pre-wrap;
}
.hyt-chat-mention {
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  background: color-mix(in srgb, var(--hyt-accent) 14%, transparent);
  color: var(--hyt-accent-ink);
  font-weight: var(--font-weight-medium);
}
/* 自己的消息：靠右、朝向自己的一角收 4，底色是强调色的浅染，文字仍是正文色。 */
.hyt-chat-item[data-outgoing="true"] {
  flex-direction: row-reverse;
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-item-body {
  align-items: flex-end;
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-item-name,
.hyt-chat-item[data-outgoing="true"] .hyt-chat-msg-role {
  display: none;
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-bubble {
  border-top-left-radius: var(--hyt-radius-12);
  border-bottom-right-radius: var(--hyt-radius-4);
  background: var(--hyt-bubble-self);
  color: var(--hyt-bubble-self-ink);
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-mention {
  background: color-mix(in srgb, var(--hyt-accent) 18%, transparent);
  color: var(--hyt-accent-ink);
}

/* 文件卡：气泡内的子卡，圆角 8 = 外层 12 − 内缩（06 §3 同心圆角）。 */
.hyt-chat-file {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 260px;
  margin-top: 4px;
  padding: 6px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-card);
  box-shadow: var(--hyt-shadow-input);
  color: inherit;
  font-family: inherit;
  text-align: start;
}
.hyt-chat-file-glyph {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: var(--hyt-radius-8);
  background: color-mix(in srgb, var(--hyt-red) 14%, var(--hyt-bg-elev));
  color: var(--hyt-red);
}
.hyt-chat-file-text {
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-chat-file-name {
  display: block;
  overflow: hidden;
  color: var(--hyt-text);
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-medium);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-file-size {
  display: block;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
/* 下载是卡内唯一的按钮，用通用的 .hyt-chat-icon；整卡不再假装可点。 */

/* 图片 */
.hyt-chat-media {
  display: block;
  max-width: 340px;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-12);
  overflow: hidden;
  background: var(--hyt-bg-card);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  cursor: zoom-in;
}
.hyt-chat-media img {
  display: block;
  max-width: 100%;
  max-height: 320px;
  border-radius: inherit;
  object-fit: cover;
}
.hyt-chat-media-missing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-card);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
}
.hyt-chat-viewer {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 40px;
  border: 0;
  background: var(--hyt-scrim);
  cursor: zoom-out;
}
.hyt-chat-viewer img {
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--hyt-radius-12);
}

/* 合并转发 */
.hyt-chat-merge {
  max-width: 400px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-card);
  box-shadow: var(--hyt-shadow-input);
  overflow: hidden;
}
.hyt-chat-merge-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  box-shadow: inset 0 calc(-1 * 0.5px) 0 0 var(--hyt-line);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
}
.hyt-chat-merge-title {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text);
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-merge-note {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--hyt-text-3);
}
.hyt-chat-merge-toggle {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hyt-accent-ink);
  font: inherit;
  font-size: var(--hyt-text-11);
  cursor: pointer;
}
.hyt-chat-merge-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}
.hyt-chat-merge-item {
  display: flex;
  gap: 6px;
  min-width: 0;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  line-height: 18px;
}
.hyt-chat-merge-item-name {
  flex: 0 0 auto;
  color: var(--hyt-text-3);
}
.hyt-chat-merge-item-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 系统消息与占位 */
.hyt-chat-system {
  display: flex;
  justify-content: center;
  margin: 16px 0 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  text-align: center;
}
.hyt-chat-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-card);
  box-shadow: var(--hyt-shadow-input);
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  line-height: 18px;
}
.hyt-chat-placeholder strong {
  color: var(--hyt-text);
  font-weight: var(--font-weight-medium);
}

/* AI 草稿卡：消息流末尾，与消息同列，蓝框标出不是人发的。 */
.hyt-chat-draft {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--hyt-radius-12);
  background: var(--hyt-accent-faint);
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line);
}
.hyt-chat-draft-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: var(--hyt-radius-10);
  background: var(--hyt-accent);
  color: var(--hyt-on-accent);
}
.hyt-chat-draft-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-chat-draft-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.hyt-chat-draft-name {
  color: var(--hyt-text);
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-medium);
  line-height: 20px;
}
.hyt-chat-draft-tag {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-accent);
  color: var(--hyt-on-accent);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-medium);
  line-height: 16px;
}
.hyt-chat-draft-meta {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-draft-text {
  margin-top: 4px;
  color: var(--hyt-text-body);
  font-size: var(--hyt-text-135);
  line-height: 22px;
  white-space: pre-wrap;
  word-break: break-word;
}
.hyt-chat-draft-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.hyt-chat-draft-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line);
  color: var(--hyt-accent-ink);
  font: inherit;
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color var(--duration-fast, 120ms) var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-chat-draft-btn:hover {
    background: var(--hyt-accent-soft);
  }
}
.hyt-chat-draft-btn[data-ghost="true"] {
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text-2);
}
@media (hover: hover) {
  .hyt-chat-draft-btn[data-ghost="true"]:hover {
    background: var(--hyt-hover);
    color: var(--hyt-text);
  }
}

/* 回到最新 */
.hyt-chat-to-end {
  position: absolute;
  left: 50%;
  bottom: 132px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform: translateX(-50%);
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--hyt-bg-elev);
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-line),
    var(--hyt-shadow-float);
  color: var(--hyt-text-2);
  font: inherit;
  font-size: var(--hyt-text-11);
  cursor: pointer;
}

/* ============================================================================
   6 · 中栏：输入区
   ========================================================================= */
/* 输入卡 88 高、圆角 16：上排 36 工具行，下排输入 + 提示 + 36 发送（09 §13）。 */
.hyt-chat-composer {
  position: relative;
  flex: 0 0 auto;
  padding: 6px 16px 16px;
}
.hyt-chat-composer-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 760px;
  min-height: 88px;
  margin: 0 auto;
  border-radius: var(--hyt-radius-16);
  background: var(--hyt-bg-bubble);
  box-shadow: var(--hyt-shadow-input);
  transition: box-shadow var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-composer-card:focus-within {
  box-shadow:
    var(--hyt-shadow-input),
    0 0 0 var(--hyt-focus-width) var(--hyt-focus-ring);
}
.hyt-chat-composer-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 36px;
  padding: 0 6px;
}
.hyt-chat-composer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  padding: 0 6px 2px;
}
.hyt-chat-composer-row textarea {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 22px;
  max-height: 140px;
  padding: 0 4px;
  border: 0;
  outline: 0;
  background: transparent;
  resize: none;
  color: var(--hyt-text);
  font: inherit;
  font-size: var(--hyt-text-135);
  line-height: 22px;
}
.hyt-chat-composer-row textarea::placeholder {
  color: var(--hyt-text-3);
}
.hyt-chat-composer-hint {
  flex: 0 0 auto;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
  white-space: nowrap;
}
.hyt-chat-composer-hint kbd {
  font-family: var(--font-family-mono, inherit);
}
/* 发送 36×36，圆角取 36/3 档的 8，强调底 + 反色字（09 §13、06 §1.2）。 */
.hyt-chat-send {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-key-bg);
  color: var(--hyt-key-fg);
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    opacity var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-send svg {
  width: 16px;
  height: 16px;
}
.hyt-chat-send:focus-visible {
  outline: var(--hyt-focus-width) solid var(--hyt-focus-ring);
  outline-offset: 2px;
}
@media (hover: hover) {
  .hyt-chat-send:hover:not(:disabled) {
    background: var(--hyt-accent-hover, color-mix(in srgb, var(--hyt-key-bg) 90%, var(--hyt-key-fg)));
  }
}
.hyt-chat-send:active:not(:disabled) {
  background: color-mix(in srgb, var(--hyt-key-bg) 84%, var(--hyt-key-fg));
}
/* 空输入不发：降到 28% 透明度，比换成灰色图标更接近「按下去也不会发生什么」。 */
.hyt-chat-send:disabled {
  opacity: 0.28;
  cursor: default;
}
.hyt-chat-composer-note {
  max-width: 760px;
  margin: 6px auto 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
}
.hyt-chat-composer-note[data-tone="warning"] { color: var(--hyt-yellow); }
.hyt-chat-composer-note[data-tone="danger"] { color: var(--hyt-red); }

/* 工具行与表情面板里的按钮都用 .hyt-chat-icon；面板里的表情是文字，需要单独给字号。 */
.hyt-chat-emoji .hyt-chat-icon {
  font-size: 16px;
  line-height: 20px;
}
/* @AI：工具行里唯一的带字按钮，用描边跟普通图标分开。 */
.hyt-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line);
  color: var(--hyt-accent-ink);
  font: inherit;
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
@media (hover: hover) {
  .hyt-ai-chip:hover {
    background: var(--hyt-accent-soft);
  }
}

/* @ 候选与表情：贴着输入卡上沿弹出。 */
.hyt-chat-mentions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-line),
    var(--hyt-shadow-float);
}
.hyt-chat-mention-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
@media (hover: hover) {
  .hyt-chat-mention-row:hover {
    background: var(--hyt-hover);
  }
}
.hyt-chat-mention-name {
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-medium);
}
.hyt-chat-mention-dept {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-emoji {
  position: absolute;
  right: 8px;
  bottom: calc(100% + 6px);
  z-index: 12;
  display: grid;
  grid-template-columns: repeat(6, 32px);
  gap: 2px;
  padding: 6px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-line),
    var(--hyt-shadow-float);
}

/* ============================================================================
   7 · 空态与提示
   ========================================================================= */
.hyt-chat-empty {
  display: grid;
  place-items: center;
  flex: 1 1 auto;
  min-height: 0;
  padding: 24px;
}
.hyt-chat-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 420px;
  padding: 24px 32px;
  border-radius: var(--hyt-radius-16);
  background: var(--hyt-bg-card);
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-line),
    var(--hyt-shadow-input);
  text-align: center;
}
.hyt-chat-empty-glyph {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 4px;
  border-radius: var(--hyt-radius-12);
  background: var(--hyt-bg-elev);
  color: var(--hyt-text-2);
}
.hyt-chat-empty-title {
  color: var(--hyt-text);
  font-size: var(--hyt-text-14);
  font-weight: var(--font-weight-bold);
  line-height: 22px;
}
.hyt-chat-empty-body {
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  line-height: var(--hyt-lh-large);
}
.hyt-chat-empty-detail {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
}
.hyt-chat-empty-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.hyt-chat-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--hyt-bg-elev);
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-11);
  line-height: 20px;
}
.hyt-chat-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--hyt-text-2);
}
.hyt-chat-status[data-tone="ready"] .hyt-chat-status-dot { background: var(--hyt-green); }
.hyt-chat-status[data-tone="warning"] .hyt-chat-status-dot { background: var(--hyt-yellow); }
.hyt-chat-heading-sub {
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 16px;
}
.hyt-chat-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hyt-accent-ink);
  font: inherit;
  font-size: var(--hyt-text-11);
  cursor: pointer;
}

/* ============================================================================
   8 · 右栏：会话信息面板（08 §8：第三列 320、贴右缘、左缘 hairline、独立滚动）
   ========================================================================= */
.hyt-chat-info {
  display: flex;
  flex-direction: column;
  flex: 0 0 320px;
  min-height: 0;
  padding: 0 12px 16px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--hyt-line-strong) transparent;
  background: var(--hyt-bg-info);
  box-shadow: inset 0.5px 0 0 0 var(--hyt-line);
}

/* 群身份区：头像 72，居中一列，名字与编辑键同一条基线。 */
.hyt-chat-info-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 0 12px;
  text-align: center;
}
.hyt-chat-info-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--hyt-text-14);
  line-height: 22px;
  font-weight: var(--font-weight-medium);
}
.hyt-chat-info-sub {
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-12);
  line-height: 18px;
}

/* 面板内动作：两个次级按钮等宽并排，高 32（05 §3）。 */
.hyt-chat-info-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  width: 100%;
  margin-top: 20px;
}
.hyt-chat-info-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text);
  font: inherit;
  font-size: var(--hyt-text-12);
  line-height: 18px;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
.hyt-chat-info-button:hover {
  background: var(--hyt-bg-row-hover);
}
.hyt-chat-info-button svg {
  width: 16px;
  height: 16px;
  color: var(--hyt-text-2);
}

/* 分节标题：12/500，右侧留一个图标位。 */
.hyt-chat-info-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  font-size: var(--hyt-text-12);
  line-height: 18px;
  font-weight: var(--font-weight-medium);
  color: var(--hyt-text);
}

/* 成员行 48：头像 32 + 名字 13/20 + 副行 11/16。 */
.hyt-chat-member {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 4px 0;
}
.hyt-chat-member-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 2px;
}
.hyt-chat-member-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--hyt-text-13);
  line-height: 20px;
}
.hyt-chat-member-status {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-11);
  line-height: 16px;
}

/* 在线状态点 6px（09 §状态点）：只作辅助，同一行必有「在线」文字。 */
.hyt-chat-face {
  position: relative;
  flex: 0 0 auto;
}
.hyt-chat-side .hyt-chat-face-dot {
  box-shadow: 0 0 0 1.5px var(--hyt-bg-side);
}
.hyt-chat-face-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--hyt-green);
  box-shadow: 0 0 0 1.5px var(--hyt-bg-info);
}

/* 快捷工具 2×2：高 36，图标 16 + 文字 12。 */
.hyt-chat-tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-top: 12px;
}
.hyt-chat-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-bg-row);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  color: var(--hyt-text);
  font: inherit;
  font-size: var(--hyt-text-12);
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}
.hyt-chat-tool:hover {
  background: var(--hyt-bg-elev);
}
.hyt-chat-tool svg {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--hyt-accent-ink);
}

/* 滚动条只留 4px，且不抢内容宽度（08 §7）。 */
.hyt-chat-side-list::-webkit-scrollbar,
.hyt-chat-messages::-webkit-scrollbar,
.hyt-chat-info::-webkit-scrollbar,
.hyt-chat-mentions::-webkit-scrollbar {
  width: 4px;
}
.hyt-chat-side-list::-webkit-scrollbar-thumb,
.hyt-chat-messages::-webkit-scrollbar-thumb,
.hyt-chat-info::-webkit-scrollbar-thumb,
.hyt-chat-mentions::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--hyt-line-strong);
}

@media (prefers-reduced-motion: reduce) {
  .hyt-chat * {
    transition: none !important;
    animation: none !important;
  }
}
`
