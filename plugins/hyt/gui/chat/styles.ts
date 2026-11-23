/**
 * 聊天主界面的样式。
 *
 * 插件源码不在应用的 Tailwind 扫描范围内，所以用 CSS 字符串注册。颜色、字号、间距、圆角全部引用
 * `docs/standard/design` 对应的语义变量，深浅色由变量自己跟随主题，不写死任何色值。
 *
 * 骨架按评审稿：左侧 280 会话栏（品牌 + 搜索 + AI 入口 + 分组列表 + 用户栏），
 * 中间聊天，右侧 280 通讯录与 AI 快捷指令。层次只靠背景与 0.5px 发丝线。
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
.hyt-chat-side,
.hyt-chat-ai {
  display: flex;
  flex-direction: column;
  flex: 0 0 280px;
  min-width: 0;
  min-height: 0;
  background: var(--hyt-bg-side);
}
.hyt-chat-side {
  box-shadow: inset calc(-1 * 0.5px) 0 0 0 var(--hyt-line);
}
.hyt-chat-ai {
  box-shadow: inset 0.5px 0 0 0 var(--hyt-line);
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
  /* 插件页面挂在外壳的工作区里，而工作区（含它头顶的 titlebar 段）是同一块 --color-main 表面。
     三栏都用它，顶部才不会在 titlebar 下沿切出一条更亮的横带；分栏只靠 0.5px 边线。
     不在外壳里时退回语义 token。 */
  --hyt-bg-surface: var(--color-main, var(--v2-background-bg-base));
  /* 左栏压暗一档、中栏抬亮一档：浅色下是「微灰栏 + 白频道」，深色下是「更暗栏 + 抬亮的频道」，
     与 Discord 的三层关系一致，消息区不再和侧栏糊成一整块。 */
  --hyt-bg-side: light-dark(
    color-mix(in srgb, var(--v2-background-bg-deep) 55%, var(--v2-background-bg-layer-01)),
    var(--v2-background-bg-base)
  );
  --hyt-bg-chat: light-dark(var(--v2-background-bg-base), var(--v2-background-bg-layer-01));
  --hyt-bg-elev: var(--v2-background-bg-layer-02);
  --hyt-line: var(--v2-border-border-muted);
  --hyt-line-strong: var(--v2-border-border-base);
  --hyt-text-body: var(--v2-text-text-base);
  --hyt-text: var(--v2-text-text-base);
  --hyt-text-strong: var(--v2-text-text-base);
  --hyt-text-2: var(--v2-text-text-muted);
  --hyt-text-3: var(--v2-text-text-faint);
  --hyt-on-accent: var(--v2-text-text-contrast);
  --hyt-accent: var(--v2-background-bg-accent);
  --hyt-accent-soft: color-mix(in srgb, var(--v2-background-bg-accent) 12%, transparent);
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
  /* 主操作键：与产品 submit 按钮同一对黑白，深色主题下反相成浅键帽。 */
  --hyt-key-bg: var(--v2-background-bg-contrast);
  --hyt-key-fg: var(--v2-text-text-contrast);
  /* 字号收敛到设计规范的四档：11 元信息 / 12 次级 / 13 次要 UI / 14 正文。 */
  --hyt-text-10: 11px;
  --hyt-text-11: 11px;
  --hyt-text-125: 12px;
  --hyt-text-13: 13px;
  --hyt-text-135: 14px;
  --hyt-text-14: 14px;
  --hyt-text-145: 14px;
  --hyt-lh-normal: 1.5;
  --hyt-lh-large: 1.6;
  --hyt-radius-4: 4px;
  --hyt-radius-6: 6px;
  --hyt-radius-8: 8px;
  --hyt-radius-10: 10px;
  --hyt-radius-12: 12px;
  /* 消息气泡：对方用浮层色，自己用主色。都在语义层，随深浅主题走。 */
  --hyt-bubble: var(--v2-background-bg-layer-02);
  --hyt-bubble-self: var(--v2-background-bg-accent);
  --hyt-bubble-self-ink: var(--v2-text-text-contrast);
}
:is([data-color-scheme="dark"]) .hyt-chat {
  --hyt-key-bg: var(--v2-grey-100);
  --hyt-key-fg: var(--v2-grey-1100);
}

/* ============================================================================
   1 · 左栏：品牌、搜索、AI 入口
   ========================================================================= */
.hyt-side-brand {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2.25);
  flex: 0 0 auto;
  height: 60px;
  padding: 0 calc(var(--spacing) * 4);
}
.hyt-side-logo {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-accent);
  color: var(--hyt-on-accent);
}
.hyt-side-name {
  font-size: var(--hyt-text-14);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.hyt-side-read {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-8);
  background: transparent;
  color: var(--hyt-text-2);
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    color var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-side-read:focus-visible {
  outline: var(--focus-width, 2px) solid var(--hyt-accent);
  outline-offset: 2px;
}
/* 没有未读时置灰：这个位置常驻，灰掉比消失更好找。 */
.hyt-side-read:disabled {
  opacity: 0.35;
  cursor: default;
}
@media (hover: hover) {
  .hyt-side-read:hover:not(:disabled) {
    background: var(--hyt-hover);
    color: var(--hyt-text);
  }
}

/* 搜索：叠在栏上的一层浅色，不用边框。 */
.hyt-chat-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex: 0 0 auto;
  height: 34px;
  margin: 12px 12px 10px;
  padding: 0 10px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-surface-raised);
  box-shadow: inset 0 0 0 0.5px transparent;
  color: var(--hyt-text-3);
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    box-shadow var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-search:focus-within {
  background: var(--hyt-hover);
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line);
}
.hyt-chat-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--hyt-text);
  font: inherit;
  font-size: var(--hyt-text-125);
}
.hyt-chat-search input::placeholder {
  color: var(--hyt-text-3);
}
.hyt-chat-search input::-webkit-search-cancel-button {
  display: none;
}
.hyt-chat-search-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--hyt-text-3);
}

.hyt-ai-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  margin: 0 12px 4px;
  padding: 10px 11px;
  border: 0;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-surface-raised);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    box-shadow var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-ai-entry:focus-visible {
  outline: var(--focus-width, 2px) solid var(--hyt-accent);
  outline-offset: 2px;
}
@media (hover: hover) {
  .hyt-ai-entry:hover {
    background: var(--hyt-hover);
    box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  }
}
.hyt-ai-entry-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-accent);
  color: var(--hyt-on-accent);
}
.hyt-ai-entry-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-ai-entry-name {
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
  color: var(--hyt-text);
  white-space: nowrap;
}
.hyt-ai-entry-sub {
  font-size: var(--hyt-text-11);
  line-height: 1.3;
  color: var(--hyt-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-ai-entry-go {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--hyt-text-3);
}

/* ============================================================================
   2 · 左栏：分组与会话行
   ========================================================================= */
.hyt-side-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 6px 8px 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--hyt-line-strong) transparent;
}

.hyt-side-section {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 8px 6px;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.5px;
}
.hyt-side-section-count {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-surface-raised);
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
}

.hyt-chat-sessions {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.hyt-chat-session {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
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
.hyt-chat-session[aria-current="true"] {
  background: var(--hyt-surface-active);
}
.hyt-chat-session[aria-current="true"]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 18px;
  transform: translateY(-50%);
  border-radius: 0 var(--hyt-radius-4) var(--hyt-radius-4) 0;
  background: var(--hyt-accent);
}
.hyt-chat-session:focus-visible {
  outline: var(--focus-width, 2px) solid var(--hyt-accent);
  outline-offset: -2px;
}
.hyt-chat-session-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-chat-session-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.hyt-chat-session-name {
  min-width: 0;
  overflow: hidden;
  font-size: var(--hyt-text-14);
  font-weight: var(--font-weight-medium);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hyt-text);
}
.hyt-chat-session[aria-current="true"] .hyt-chat-session-name,
.hyt-chat-session[data-unread="true"] .hyt-chat-session-name {
  color: var(--hyt-text-strong);
  font-weight: var(--font-weight-bold);
}
.hyt-chat-session[data-unread="true"] .hyt-chat-session-preview {
  color: var(--hyt-text-2);
}
.hyt-chat-session-tag {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text-3);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  line-height: 15px;
}
.hyt-chat-session-time {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-125);
  font-variant-numeric: tabular-nums;
}
.hyt-chat-session-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 3px;
}
.hyt-chat-session-preview {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-13);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-group-mark {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--hyt-text-3);
}
.hyt-chat-session-at {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-accent-soft);
  color: var(--hyt-accent-ink);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  line-height: 16px;
}
.hyt-chat-session-badge {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--hyt-danger);
  color: var(--hyt-on-accent);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}
.hyt-chat-session-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--hyt-accent);
}

/* 筛选：一条横向胶囊，选中态用主色低饱和底 + 主色字。 */
.hyt-chat-filters {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  margin: 0 12px 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.hyt-chat-filters::-webkit-scrollbar {
  display: none;
}
.hyt-chat-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hyt-text-2);
  font-family: inherit;
  font-size: var(--hyt-text-125);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    color var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-filter-chip:focus-visible {
  outline: var(--focus-width, 2px) solid var(--hyt-accent);
  outline-offset: 1px;
}
@media (hover: hover) {
  .hyt-chat-filter-chip:hover {
    background: var(--hyt-hover);
    color: var(--hyt-text);
  }
}
.hyt-chat-filter-chip[aria-pressed="true"] {
  background: var(--hyt-accent-soft);
  color: var(--hyt-accent-ink);
  font-weight: var(--font-weight-medium);
}
.hyt-chat-filter-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--hyt-accent);
}
.hyt-chat-filter-chip[aria-pressed="true"] .hyt-chat-filter-dot {
  background: var(--hyt-accent-ink);
}

/* ============================================================================
   3 · 左栏：当前用户
   ========================================================================= */
.hyt-side-user {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
  height: 58px;
  padding: 0 12px;
  box-shadow: inset 0 0.5px 0 0 var(--hyt-line);
}
.hyt-side-user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-side-user-name {
  overflow: hidden;
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-bold);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-side-user-sub {
  overflow: hidden;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-side-user-tools {
  display: flex;
  flex: 0 0 auto;
  gap: 1px;
}

/* ============================================================================
   4 · 通用控件：图标按钮、头像
   ========================================================================= */
.hyt-icon-button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  color: var(--hyt-text-3);
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    color var(--duration-fast, 120ms) var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-icon-button:hover {
    background: var(--hyt-surface-hover, var(--hyt-hover));
    color: var(--hyt-text);
  }
}
.hyt-icon-button:focus-visible {
  outline: var(--focus-width, 2px) solid var(--hyt-accent);
  outline-offset: 1px;
}
.hyt-icon-button[aria-pressed="true"] {
  background: var(--hyt-surface-active, var(--hyt-active));
  color: var(--hyt-text);
}

/* 头像：方形圆角，尺寸、圆角与底色由组件按虹云通的公式算好（inline）。 */
.hyt-chat-avatar {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  overflow: hidden;
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
   5 · 中栏：会话头
   ========================================================================= */
.hyt-chat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  height: 60px;
  padding: 0 24px;
}
.hyt-chat-head-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.hyt-chat-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--hyt-text);
  font-size: var(--hyt-text-145);
  font-weight: var(--font-weight-bold);
  line-height: 1.3;
}
.hyt-chat-head-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-pill {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: var(--hyt-radius-4);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-regular);
  white-space: nowrap;
}
.hyt-chat-ai-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-accent-soft, color-mix(in srgb, var(--hyt-accent) 12%, transparent));
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 34%, transparent));
  color: var(--hyt-accent-ink);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
}
.hyt-chat-head-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-live-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--hyt-green);
}
.hyt-chat-head-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}

/* ============================================================================
   6 · 中栏：消息流
   ========================================================================= */
.hyt-chat-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 滚动条出现/消失会让内容宽度跳 1~2px，消息一多像是闪了一下；留出固定槽位。 */
  scrollbar-gutter: stable;
  padding: 20px 24px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--hyt-line-strong) transparent;
}
.hyt-chat-flow {
  display: flex;
  flex-direction: column;
}

.hyt-chat-day {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}
.hyt-chat-day::before,
.hyt-chat-day::after {
  content: "";
  flex: 1 1 auto;
  height: 0.5px;
  background: var(--hyt-line);
}

.hyt-chat-item {
  display: flex;
  gap: 12px;
  margin-top: 24px;
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
/* 组内后续消息：不重复头像与名字，气泡之间只留 6px，和飞书一样是同一个人连发的紧凑感。 */
.hyt-chat-item[data-first="false"] {
  margin-top: 6px;
}
.hyt-chat-item[data-first="false"] > .hyt-chat-avatar {
  visibility: hidden;
}
.hyt-chat-item-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: min(68%, 620px);
  flex: 0 1 auto;
}
.hyt-chat-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  min-width: 0;
}
.hyt-chat-item-name {
  overflow: hidden;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-medium);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-msg-role {
  flex: 0 0 auto;
  max-width: 132px;
  overflow: hidden;
  padding: 1px 5px;
  border-radius: var(--hyt-radius-4);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-10);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-msg-role[data-you="true"] {
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 34%, transparent));
  color: var(--hyt-accent-ink);
}
.hyt-chat-item-time {
  flex: 0 0 auto;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-variant-numeric: tabular-nums;
}
.hyt-chat-at-mark {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: var(--hyt-radius-4);
  background: color-mix(in srgb, var(--hyt-red) 16%, transparent);
  color: var(--hyt-red);
  font-size: var(--hyt-text-10);
  font-weight: var(--font-weight-bold);
  line-height: 16px;
}

/* 气泡：对方是浮层色，自己是主色；宽度随内容，最长 100%。 */
.hyt-chat-bubble {
  max-width: 100%;
  padding: 9px 13px;
  border-radius: var(--hyt-radius-10);
  background: var(--hyt-bubble);
  color: var(--hyt-text-body);
  font-size: var(--hyt-text-135);
  line-height: var(--hyt-lh-large);
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
/* 自己的消息：飞书式右侧气泡，不重复头像与名字，只留时间。 */
.hyt-chat-item[data-outgoing="true"] {
  flex-direction: row-reverse;
}
.hyt-chat-item[data-outgoing="true"] > .hyt-chat-avatar,
.hyt-chat-item[data-outgoing="true"] .hyt-chat-item-name,
.hyt-chat-item[data-outgoing="true"] .hyt-chat-msg-role {
  display: none;
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-item-body {
  align-items: flex-end;
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-item-meta {
  justify-content: flex-end;
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-bubble {
  background: var(--hyt-bubble-self);
  color: var(--hyt-bubble-self-ink);
}
.hyt-chat-item[data-outgoing="true"] .hyt-chat-mention {
  background: color-mix(in srgb, var(--hyt-bubble-self-ink) 18%, transparent);
  color: inherit;
}

/* 文件卡 */
.hyt-chat-file {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 300px;
  margin-top: 8px;
  padding: 9px 11px;
  border: 0;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    box-shadow var(--duration-fast, 120ms) var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-chat-file:hover {
    background: var(--hyt-bg-elev);
    box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  }
}
.hyt-chat-file-glyph {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: var(--hyt-radius-6);
  background: var(--hyt-bg-elev);
  color: var(--hyt-text-2);
}
.hyt-chat-file-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}
.hyt-chat-file-name {
  overflow: hidden;
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-file-size {
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
}

/* 图片 */
.hyt-chat-media {
  display: block;
  max-width: 340px;
  margin-top: 8px;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-8);
  overflow: hidden;
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  cursor: zoom-in;
}
.hyt-chat-media img {
  display: block;
  max-width: 100%;
  max-height: 320px;
  object-fit: cover;
}
.hyt-chat-media-missing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
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
  border-radius: var(--hyt-radius-8);
}

/* 合并转发 */
.hyt-chat-merge {
  max-width: 400px;
  margin-top: 8px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  overflow: hidden;
}
.hyt-chat-merge-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  box-shadow: inset 0 calc(-1 * 0.5px) 0 0 var(--hyt-line);
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
}
.hyt-chat-merge-title {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-bold);
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
  gap: 5px;
  padding: 9px 11px;
}
.hyt-chat-merge-item {
  display: flex;
  gap: 6px;
  min-width: 0;
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  line-height: 1.5;
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
  margin: 24px 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
}
.hyt-chat-placeholder {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-125);
  line-height: 1.5;
}
.hyt-chat-placeholder strong {
  color: var(--hyt-text);
  font-weight: var(--font-weight-bold);
}

/* AI 草稿卡：消息流末尾，与消息同列，蓝框标出不是人发的。 */
.hyt-chat-draft {
  display: flex;
  gap: 11px;
  margin: 10px 0;
  padding: 13px 15px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-accent-soft, color-mix(in srgb, var(--hyt-accent) 10%, transparent));
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 28%, transparent)),
    inset 2px 0 0 0 var(--hyt-accent);
}
.hyt-chat-draft-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: var(--hyt-radius-8);
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
  gap: 7px;
  margin-bottom: 5px;
  min-width: 0;
}
.hyt-chat-draft-name {
  color: var(--hyt-text);
  font-size: var(--hyt-text-13);
  font-weight: var(--font-weight-bold);
}
.hyt-chat-draft-tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-accent);
  color: var(--hyt-on-accent);
  font-size: var(--hyt-text-10);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.3px;
}
.hyt-chat-draft-meta {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chat-draft-text {
  color: var(--hyt-text-body);
  font-size: var(--hyt-text-135);
  line-height: var(--hyt-lh-large);
  white-space: pre-wrap;
  word-break: break-word;
}
.hyt-chat-draft-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}
.hyt-chat-draft-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 28%, transparent));
  color: var(--hyt-accent-ink);
  font: inherit;
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color var(--duration-fast, 120ms) var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-chat-draft-btn:hover {
    background: var(--hyt-accent-soft, color-mix(in srgb, var(--hyt-accent) 12%, transparent));
  }
}
.hyt-chat-draft-btn[data-ghost="true"] {
  box-shadow: inset 0 0 0 0.5px var(--hyt-line-strong);
  color: var(--hyt-text-2);
}
.hyt-chat-draft-btn[data-ghost="true"]:hover {
  background: var(--hyt-hover);
  color: var(--hyt-text);
}

/* 回到最新 */
.hyt-chat-to-end {
  position: absolute;
  left: 50%;
  bottom: 132px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transform: translateX(-50%);
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--hyt-bg-elev);
  box-shadow:
    inset 0 0 0 0.5px var(--hyt-line),
    0 2px 8px color-mix(in srgb, var(--hyt-scrim) 40%, transparent);
  color: var(--hyt-text-2);
  font: inherit;
  font-size: var(--hyt-text-11);
  cursor: pointer;
}

/* ============================================================================
   7 · 中栏：输入区
   ========================================================================= */
.hyt-chat-composer {
  position: relative;
  flex: 0 0 auto;
  padding: 8px 24px 18px;
}
.hyt-chat-composer-card {
  position: relative;
  padding: 8px 10px;
  border-radius: var(--hyt-radius-12);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    box-shadow var(--duration-fast, 120ms) var(--ease-out, ease);
}
.hyt-chat-composer-card:focus-within {
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 30%, transparent));
}
.hyt-chat-composer-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.hyt-chat-composer-row textarea {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 40px;
  max-height: 140px;
  padding: 10px 6px;
  border: 0;
  outline: 0;
  background: transparent;
  resize: none;
  color: var(--hyt-text);
  font: inherit;
  font-size: var(--hyt-text-135);
  line-height: var(--hyt-lh-large);
}
.hyt-chat-composer-row textarea::placeholder {
  color: var(--hyt-text-3);
}
.hyt-chat-composer-tools {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
  padding-bottom: 1px;
}
.hyt-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 4px;
  padding: 4px 9px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 28%, transparent));
  color: var(--hyt-accent-ink);
  font: inherit;
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
}
.hyt-ai-chip:hover {
  background: color-mix(in srgb, var(--hyt-accent) 12%, transparent);
}
.hyt-chat-tool {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  color: var(--hyt-text-3);
  font: inherit;
  cursor: pointer;
}
@media (hover: hover) {
  .hyt-chat-tool:hover {
    background: var(--hyt-hover);
    color: var(--hyt-text);
  }
}
.hyt-chat-tool[aria-pressed="true"] {
  background: var(--hyt-active);
  color: var(--hyt-text);
}
.hyt-chat-send {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--hyt-key-bg);
  color: var(--hyt-key-fg);
  cursor: pointer;
  transition: opacity var(--duration-fast, 120ms) var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-chat-send:hover:not(:disabled) {
    background: color-mix(in srgb, var(--hyt-key-bg) 90%, var(--hyt-key-fg));
  }
}
.hyt-chat-send:active:not(:disabled) {
  background: color-mix(in srgb, var(--hyt-key-bg) 80%, var(--hyt-key-fg));
}
.hyt-chat-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.hyt-chat-composer-note {
  margin: 6px 2px 0;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 1.4;
}
.hyt-chat-composer-note[data-tone="warning"] { color: var(--hyt-yellow); }
.hyt-chat-composer-note[data-tone="danger"] { color: var(--hyt-red); }

/* @ 候选与表情：贴着输入框上沿弹出。 */
.hyt-chat-mentions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 1px;
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
  padding: 5px 7px;
  border: 0;
  border-radius: var(--hyt-radius-6);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.hyt-chat-mention-row:hover {
  background: var(--hyt-hover);
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
   8 · 右栏：通讯录与 AI 快捷指令
   ========================================================================= */
.hyt-ctx-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
  padding: 18px 16px 8px;
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-bold);
}
.hyt-ctx-head-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}
.hyt-ctx-head-count {
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-regular);
}
.hyt-ctx-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 20px;
  scrollbar-width: thin;
  scrollbar-color: var(--hyt-line-strong) transparent;
}
.hyt-ctx-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px 4px;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.5px;
}
.hyt-ctx-group-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--hyt-green);
}
.hyt-ctx-member {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 5px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color 100ms var(--ease-out, ease);
}
@media (hover: hover) {
  .hyt-ctx-member:hover {
    background: var(--hyt-hover);
  }
}
.hyt-ctx-member-name {
  min-width: 0;
  overflow: hidden;
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-ctx-member-role {
  flex: 0 0 auto;
  max-width: 96px;
  margin-left: auto;
  overflow: hidden;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-ctx-empty {
  padding: 6px 16px;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
}
.hyt-ctx-card {
  margin: 16px 12px 0;
  padding: 11px;
  border-radius: var(--hyt-radius-8);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
}
.hyt-ctx-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--hyt-accent-ink);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-bold);
}
.hyt-ctx-cmd {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--hyt-text-2);
  font: inherit;
  font-size: var(--hyt-text-125);
  text-align: start;
  cursor: pointer;
}
.hyt-ctx-cmd:hover {
  color: var(--hyt-text);
}
.hyt-ctx-cmd kbd {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: var(--hyt-radius-4);
  background: var(--hyt-accent-soft, color-mix(in srgb, var(--hyt-accent) 12%, transparent));
  box-shadow: inset 0 0 0 0.5px var(--hyt-accent-line, color-mix(in srgb, var(--hyt-accent) 28%, transparent));
  color: var(--hyt-accent-ink);
  font-family: inherit;
  font-size: var(--hyt-text-11);
  font-weight: var(--font-weight-bold);
  line-height: 17px;
}
.hyt-ctx-kb-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
}
.hyt-ctx-kb-item + .hyt-ctx-kb-item {
  box-shadow: inset 0 0.5px 0 0 var(--hyt-line);
}
.hyt-ctx-kb-title {
  color: var(--hyt-text);
  font-size: var(--hyt-text-125);
  font-weight: var(--font-weight-medium);
}
.hyt-ctx-kb-snippet {
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ============================================================================
   9 · 空态与提示
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
  padding: 28px 32px;
  border-radius: var(--hyt-radius-12);
  background: var(--hyt-bg-elev);
  box-shadow: inset 0 0 0 0.5px var(--hyt-line);
  text-align: center;
}
.hyt-chat-empty-glyph {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 4px;
  border-radius: var(--hyt-radius-10);
  background: var(--hyt-bg-elev);
  color: var(--hyt-text-2);
}
.hyt-chat-empty-title {
  color: var(--hyt-text);
  font-size: var(--hyt-text-14);
  font-weight: var(--font-weight-bold);
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
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--hyt-bg-elev);
  color: var(--hyt-text-2);
  font-size: var(--hyt-text-11);
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
}
.hyt-chat-hint {
  margin: 8px;
  color: var(--hyt-text-3);
  font-size: var(--hyt-text-11);
  line-height: 1.5;
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

@media (prefers-reduced-motion: reduce) {
  .hyt-chat * {
    transition: none !important;
  }
}
`
