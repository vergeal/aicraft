/**
 * 聊天主界面的样式。
 *
 * 插件源码不在应用的 Tailwind 扫描范围内，所以用 CSS 字符串注册。颜色、字号、间距、圆角全部引用
 * `docs/standard/design` 对应的语义变量，深浅色由变量自己跟随主题，不写死任何色值。
 *
 * 视觉语言是 Discord 式的三层结构：左右栏是"外壳"（更暗），中间频道是"内容"（更亮一档），
 * 所有消息左对齐、无气泡、连续同人消息合并，头像圆形。层次只靠背景与发丝线，不靠边框和阴影。
 */
export const css = `
.hyt-chat {
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: light-dark(var(--v2-background-bg-deep), var(--v2-background-bg-base));
  color: var(--v2-text-text-base);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  -webkit-font-smoothing: antialiased;
}

/* 左右栏与容器同色，中栏抬亮一档：浅色下中栏最亮，深色下中栏最亮，与 Discord 一致。 */
.hyt-chat-side {
  display: flex;
  flex-direction: column;
  flex: 0 0 300px;
  min-width: 0;
  min-height: 0;
  background: inherit;
}
.hyt-chat-ai {
  display: flex;
  flex-direction: column;
  flex: 0 0 296px;
  min-width: 0;
  min-height: 0;
  background: inherit;
}
.hyt-chat-main {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  border-inline: 0.5px solid color-mix(in srgb, var(--v2-border-border-muted) 55%, transparent);
  background: light-dark(var(--v2-background-bg-base), var(--v2-background-bg-layer-01));
}

/* 频道标题栏：固定的 48px，底部一条发丝线，而不是整块边框。 */
.hyt-chat-pane-head {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2.5);
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 calc(var(--spacing) * 4);
  border-bottom: 0.5px solid color-mix(in srgb, var(--v2-border-border-muted) 70%, transparent);
}
.hyt-chat-pane-head-main {
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
}
.hyt-chat-heading-lead {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2.5);
  min-width: 0;
}
.hyt-chat-heading {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.25);
  min-width: 0;
}
.hyt-chat-heading-title {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  line-height: calc(var(--font-size-small) + var(--spacing) * 1.5);
  color: var(--v2-text-text-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-heading-sub {
  font-size: var(--font-size-x-small);
  line-height: calc(var(--font-size-x-small) + var(--spacing) * 1.25);
  color: var(--v2-text-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-heading-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  flex: 0 0 auto;
}

.hyt-chat-status {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  padding: 0 calc(var(--spacing) * 2) 0 calc(var(--spacing) * 1.5);
  height: calc(var(--spacing) * 5.5);
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 7%, transparent);
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-xx-small);
  line-height: var(--line-height-normal);
  white-space: nowrap;
}
.hyt-chat-status-dot {
  width: calc(var(--spacing) * 1.5);
  height: calc(var(--spacing) * 1.5);
  border-radius: 999px;
  background: var(--v2-icon-icon-muted);
}
.hyt-chat-status[data-tone="ready"] .hyt-chat-status-dot { background: var(--v2-state-fg-success); }
.hyt-chat-status[data-tone="warning"] .hyt-chat-status-dot { background: var(--v2-state-fg-warning, var(--v2-icon-icon-muted)); }

/* 搜索框：Discord 用半透明白/黑叠在栏上，不用边框。 */
.hyt-chat-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin: calc(var(--spacing) * 1) calc(var(--spacing) * 2) calc(var(--spacing) * 2);
  padding: 0 calc(var(--spacing) * 2);
  height: 30px;
  border: 0;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 6%, transparent);
  color: var(--v2-icon-icon-faint);
  transition: background-color 120ms ease;
}
@media (hover: hover) {
  .hyt-chat-search:hover { background: color-mix(in srgb, var(--v2-background-bg-inverse) 8%, transparent); }
}
.hyt-chat-search:focus-within { background: color-mix(in srgb, var(--v2-background-bg-inverse) 10%, transparent); }
.hyt-chat-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--v2-text-text-base);
  font: inherit;
  font-size: var(--font-size-x-small);
}
.hyt-chat-search input::placeholder { color: var(--v2-text-text-faint); }
.hyt-chat-search input::-webkit-search-cancel-button { display: none; }
.hyt-chat-search-icon {
  display: inline-flex;
  margin-right: calc(var(--spacing) * 1.5);
  color: var(--v2-icon-icon-faint);
}

.hyt-chat-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--v2-border-border-strong) transparent;
}

.hyt-chat-sessions {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 calc(var(--spacing) * 2) calc(var(--spacing) * 3);
}
.hyt-chat-session {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2.5);
  width: 100%;
  min-height: 42px;
  padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 100ms ease;
}
@media (hover: hover) {
  .hyt-chat-session:hover { background: var(--v2-overlay-simple-overlay-hover); }
}
.hyt-chat-session:active { background: var(--v2-overlay-simple-overlay-pressed); }
.hyt-chat-session:focus-visible {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: -2px;
}
.hyt-chat-session[aria-current="true"] {
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 9%, transparent);
}
.hyt-chat-session[aria-current="true"] .hyt-chat-session-name { color: var(--v2-text-text-base); }

/* 头像一律圆形。没有真实头像时用同系的低饱和底色 + 首字，做成 Discord 那种圆形字母头像。 */
.hyt-chat-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--v2-avatar-bg-gray, var(--v2-background-bg-layer-02));
  color: var(--v2-avatar-fg, var(--v2-text-text-inverse));
  font-size: var(--font-size-xx-small);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  letter-spacing: 0;
  user-select: none;
}
.hyt-chat-avatar[data-tone="blue"] { background: var(--v2-avatar-bg-blue); }
.hyt-chat-avatar[data-tone="green"] { background: var(--v2-avatar-bg-green); }
.hyt-chat-avatar[data-tone="orange"] { background: var(--v2-avatar-bg-orange); }
.hyt-chat-avatar[data-tone="purple"] { background: var(--v2-avatar-bg-purple); }
.hyt-chat-avatar[data-tone="pink"] { background: var(--v2-avatar-bg-pink); }
.hyt-chat-avatar[data-tone="cyan"] { background: var(--v2-avatar-bg-cyan); }
.hyt-chat-avatar[data-tone="yellow"] { background: var(--v2-avatar-bg-yellow); }
.hyt-chat-avatar[data-tone="gray"] { background: var(--v2-avatar-bg-gray); }
.hyt-chat-avatar[data-size="row"], .hyt-chat-avatar[data-size="head"] { width: 32px; height: 32px; }
.hyt-chat-avatar[data-size="bubble"] { width: 40px; height: 40px; font-size: var(--font-size-small); }
.hyt-chat-avatar[data-size="mention"] { width: 24px; height: 24px; font-size: var(--font-size-xx-small); }
.hyt-chat-avatar[data-size="head"] { width: 32px; height: 32px; }
.hyt-chat-avatar-photo { display: block; width: 100%; height: 100%; object-fit: cover; }
.hyt-chat-avatar-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 1fr;
  gap: 0.5px;
  width: 100%;
  height: 100%;
  background: var(--v2-background-bg-layer-02);
}
.hyt-chat-avatar-grid img { display: block; width: 100%; height: 100%; object-fit: cover; }
.hyt-chat-avatar[data-size="mention"] .hyt-chat-avatar-grid { gap: 0; }
/* 头像文件存在但 data URL 还没到时先留中性圆底，避免彩色底闪一下。 */
.hyt-chat-avatar[data-pending="true"] { background: var(--v2-background-bg-layer-02); }

.hyt-chat-session-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
}
.hyt-chat-session-top {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  min-width: 0;
}
.hyt-chat-session-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-medium);
  line-height: calc(var(--font-size-small) + var(--spacing) * 1.25);
  color: var(--v2-text-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-session-time {
  flex: 0 0 auto;
  font-size: var(--font-size-xx-small);
  line-height: calc(var(--font-size-xx-small) + var(--spacing) * 0.75);
  color: var(--v2-text-text-faint);
  white-space: nowrap;
}
.hyt-chat-session-bottom {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  min-width: 0;
}
.hyt-chat-session-preview {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-x-small);
  line-height: calc(var(--font-size-x-small) + var(--spacing) * 1.25);
  color: var(--v2-text-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-session-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
  padding: 0 calc(var(--spacing) * 1.25);
  border-radius: 999px;
  background: var(--v2-state-fg-danger);
  color: var(--v2-text-text-inverse);
  font-size: var(--font-size-xx-small);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}
.hyt-chat-session-at {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: calc(var(--spacing) * 4);
  padding: 0 calc(var(--spacing) * 1.25);
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-state-fg-danger) 14%, transparent);
  color: var(--v2-state-fg-danger);
  font-size: var(--font-size-xx-small);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}
.hyt-chat-group-mark {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--v2-icon-icon-faint);
}

.hyt-chat-hint {
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 3);
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
  text-align: center;
}

/* 消息流：无气泡平铺。contents 让消息项直接参与 column-reverse，天然贴底。 */
.hyt-chat-messages {
  display: flex;
  flex-direction: column-reverse;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: calc(var(--spacing) * 4) 0 calc(var(--spacing) * 2);
  scrollbar-width: thin;
  scrollbar-color: var(--v2-border-border-strong) transparent;
}
.hyt-chat-flow { display: contents; }
.hyt-chat-item {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--spacing) * 4);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 4);
  border-radius: var(--radius-md);
}
@media (hover: hover) {
  .hyt-chat-item:hover { background: color-mix(in srgb, var(--v2-background-bg-inverse) 3%, transparent); }
}
/* 被 @ 的消息整行淡红，比给气泡描边更接近 Discord 的提示方式。 */
.hyt-chat-item[data-at="true"] { background: color-mix(in srgb, var(--v2-state-fg-danger) 6%, transparent); }
.hyt-chat-item-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
}
.hyt-chat-item-meta {
  display: flex;
  align-items: baseline;
  gap: calc(var(--spacing) * 2);
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-xx-small);
  line-height: calc(var(--font-size-xx-small) + var(--spacing) * 1);
}
.hyt-chat-item-name {
  color: var(--v2-text-text-base);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  line-height: calc(var(--font-size-small) + var(--spacing) * 1.25);
}
/* 组内后续消息：头像留空、名字与时间收起，只显示正文，行距收紧。 */
.hyt-chat-item[data-first="false"] { padding-top: 0; padding-bottom: 0; }
.hyt-chat-item[data-first="false"] .hyt-chat-item-meta { display: none; }
.hyt-chat-item[data-first="false"] > .hyt-chat-avatar { visibility: hidden; }
.hyt-chat-item[data-first="false"] .hyt-chat-item-body { justify-content: flex-start; }

.hyt-chat-bubble {
  position: relative;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--v2-text-text-base);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.hyt-chat-item[data-at="true"] .hyt-chat-bubble { box-shadow: none; }
.hyt-chat-mention {
  padding: 0 calc(var(--spacing) * 0.5);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--v2-text-text-accent) 12%, transparent);
  color: var(--v2-text-text-accent);
  font-weight: var(--font-weight-medium);
}
.hyt-chat-at-mark {
  display: inline-flex;
  align-items: center;
  height: calc(var(--spacing) * 3.5);
  padding: 0 calc(var(--spacing) * 1.25);
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-state-fg-danger) 16%, transparent);
  color: var(--v2-state-fg-danger);
  font-size: var(--font-size-xx-small);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}

/* 日期分隔：两侧发丝线夹住日期，和 Discord 的时间线一致。 */
.hyt-chat-day {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4) calc(var(--spacing) * 1);
}
.hyt-chat-day::before,
.hyt-chat-day::after {
  content: "";
  flex: 1 1 auto;
  height: 0.5px;
  background: color-mix(in srgb, var(--v2-border-border-muted) 80%, transparent);
}
.hyt-chat-day span {
  flex: 0 0 auto;
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-xx-small);
  line-height: calc(var(--font-size-xx-small) + var(--spacing) * 0.75);
}

.hyt-chat-system {
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: calc(var(--spacing) * 1) calc(var(--spacing) * 4);
}
.hyt-chat-system span {
  max-width: 80%;
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-x-small);
  line-height: calc(var(--font-size-x-small) + var(--spacing) * 1.25);
  text-align: center;
}
.hyt-chat-recall {
  font-style: normal;
  opacity: 0.9;
}

.hyt-chat-media {
  display: block;
  max-width: 300px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  color: inherit;
  cursor: zoom-in;
  overflow: hidden;
  line-height: 0;
}
.hyt-chat-media img {
  display: block;
  max-width: 300px;
  max-height: 300px;
  border-radius: var(--radius-lg);
  object-fit: cover;
}
.hyt-chat-media[data-outgoing="true"] { border-color: transparent; }
.hyt-chat-media-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 90px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-x-small);
}

.hyt-chat-file {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2.5);
  width: 280px;
  max-width: 100%;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border: 0;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
  color: var(--v2-text-text-base);
  text-align: left;
  cursor: pointer;
}
@media (hover: hover) {
  .hyt-chat-file:hover { background: color-mix(in srgb, var(--v2-background-bg-inverse) 8%, transparent); }
}
.hyt-chat-file-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 8%, transparent);
  color: var(--v2-text-text-base);
}
.hyt-chat-file-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.hyt-chat-file-name {
  font-size: var(--font-size-x-small);
  font-weight: var(--font-weight-medium);
  color: var(--v2-text-text-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-file-size { font-size: var(--font-size-xx-small); color: var(--v2-text-text-faint); }

.hyt-chat-placeholder {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2.5);
  width: 280px;
  max-width: 100%;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border: 0;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
}
.hyt-chat-placeholder svg { flex: 0 0 auto; color: var(--v2-icon-icon-muted); }

.hyt-chat-merge {
  display: flex;
  flex-direction: column;
  width: min(340px, 100%);
  border: 0;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
  overflow: hidden;
}
.hyt-chat-merge-head {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
}
.hyt-chat-merge-title {
  font-size: var(--font-size-x-small);
  font-weight: var(--font-weight-medium);
  color: var(--v2-text-text-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hyt-chat-merge-note { font-size: var(--font-size-xx-small); color: var(--v2-text-text-faint); }
.hyt-chat-merge-toggle {
  align-self: flex-start;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--v2-text-text-accent);
  font: inherit;
  font-size: var(--font-size-xx-small);
  cursor: pointer;
}
.hyt-chat-merge-items {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  max-height: 240px;
  overflow-y: auto;
  padding: 0 calc(var(--spacing) * 3) calc(var(--spacing) * 2.5);
  scrollbar-width: thin;
}
.hyt-chat-merge-item { display: flex; flex-direction: column; gap: 1px; }
.hyt-chat-merge-item-name { font-size: var(--font-size-xx-small); color: var(--v2-text-text-faint); }
.hyt-chat-merge-item-text {
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
  color: var(--v2-text-text-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 输入区：Discord 的无边框灰块，焦点不加描边，只把底色提亮。 */
.hyt-chat-composer {
  flex: 0 0 auto;
  padding: 0 calc(var(--spacing) * 4) calc(var(--spacing) * 4);
  border-top: 0;
  background: transparent;
}
.hyt-chat-composer-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  max-width: 760px;
  margin: 0 auto;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 2) calc(var(--spacing) * 1.5);
  border: 0;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 7%, transparent);
  transition: background-color 120ms ease;
}
.hyt-chat-composer-card:focus-within { background: color-mix(in srgb, var(--v2-background-bg-inverse) 9%, transparent); }
.hyt-chat-composer textarea {
  width: 100%;
  min-height: 22px;
  max-height: 180px;
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 1);
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: var(--v2-text-text-base);
  font: inherit;
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
}
.hyt-chat-composer textarea::placeholder { color: var(--v2-text-text-faint); }
.hyt-chat-composer-tools {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 0.5);
}
.hyt-chat-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--v2-icon-icon-muted);
  cursor: pointer;
  transition: background-color 100ms ease, color 100ms ease;
}
@media (hover: hover) {
  .hyt-chat-tool:hover { background: color-mix(in srgb, var(--v2-background-bg-inverse) 8%, transparent); color: var(--v2-text-text-base); }
}
.hyt-chat-tool:disabled { color: var(--v2-icon-icon-faint); cursor: default; }
.hyt-chat-tool[aria-pressed="true"] {
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 10%, transparent);
  color: var(--v2-text-text-base);
}
.hyt-chat-tool-gap { flex: 1 1 auto; }
.hyt-chat-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--v2-background-bg-accent);
  color: var(--v2-text-text-contrast);
  cursor: pointer;
  transition: filter 100ms ease, opacity 100ms ease;
}
@media (hover: hover) {
  .hyt-chat-send:hover:not(:disabled) { filter: brightness(1.08); }
}
.hyt-chat-send:disabled {
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 10%, transparent);
  color: var(--v2-icon-icon-faint);
  cursor: not-allowed;
}
.hyt-chat-send[aria-busy="true"] { opacity: 0.6; cursor: progress; }
.hyt-chat-composer-note {
  max-width: 760px;
  margin: calc(var(--spacing) * 1.5) auto 0;
  padding: 0 calc(var(--spacing) * 1);
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-xx-small);
  line-height: var(--line-height-normal);
}
.hyt-chat-composer-note[data-tone="warning"] { color: var(--v2-state-fg-warning, var(--v2-text-text-muted)); }
.hyt-chat-composer-note[data-tone="danger"] { color: var(--v2-state-fg-danger); }

.hyt-chat-emoji {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding-bottom: calc(var(--spacing) * 1);
}
.hyt-chat-emoji .hyt-chat-tool { font-size: var(--font-size-small); }

.hyt-chat-mentions {
  display: flex;
  flex-direction: column;
  max-height: 200px;
  overflow-y: auto;
  padding-bottom: calc(var(--spacing) * 1);
  scrollbar-width: thin;
}
.hyt-chat-mention-row {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 1.5);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
@media (hover: hover) {
  .hyt-chat-mention-row:hover { background: color-mix(in srgb, var(--v2-background-bg-inverse) 8%, transparent); }
}
.hyt-chat-mention-name { font-size: var(--font-size-x-small); color: var(--v2-text-text-base); }
.hyt-chat-mention-dept {
  font-size: var(--font-size-xx-small);
  color: var(--v2-text-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 右栏：去掉卡片边框，只用分组间距与一句弱说明，避免整屏都是盒子。 */
.hyt-chat-ai-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 3.5) calc(var(--spacing) * 5);
}
.hyt-chat-ai-empty {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 2) 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.hyt-chat-ai-empty-title {
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-base);
  color: var(--v2-text-text-base);
}
.hyt-chat-ai-empty-body {
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
  color: var(--v2-text-text-faint);
}
.hyt-chat-ai-block { display: flex; flex-direction: column; gap: calc(var(--spacing) * 2); }
.hyt-chat-ai-label {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-xx-small);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.hyt-chat-ai-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 2.5);
  border: 0;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
}
.hyt-chat-ai-row { display: flex; align-items: center; justify-content: space-between; gap: calc(var(--spacing) * 2); }
.hyt-chat-ai-row-title { font-size: var(--font-size-small); font-weight: var(--font-weight-medium); }
.hyt-chat-ai-note { font-size: var(--font-size-xx-small); line-height: var(--line-height-base); color: var(--v2-text-text-faint); }
.hyt-chat-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 calc(var(--spacing) * 1.5);
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 8%, transparent);
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-xx-small);
  white-space: nowrap;
}
.hyt-chat-pill[data-on="true"] {
  background: color-mix(in srgb, var(--v2-state-fg-success) 16%, transparent);
  color: var(--v2-state-fg-success);
}

.hyt-chat-draft {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 2.5);
  border: 0;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
}
.hyt-chat-draft-text {
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
  color: var(--v2-text-text-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.hyt-chat-draft-foot { display: flex; align-items: center; justify-content: space-between; gap: calc(var(--spacing) * 2); }
.hyt-chat-draft-note { font-size: var(--font-size-xx-small); color: var(--v2-text-text-faint); }
.hyt-chat-link {
  align-self: flex-start;
  border: 0;
  padding: calc(var(--spacing) * 0.5) 0;
  background: transparent;
  color: var(--v2-text-text-accent);
  font: inherit;
  font-size: var(--font-size-x-small);
  cursor: pointer;
}
.hyt-chat-link:hover { text-decoration: underline; }

.hyt-chat-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: calc(var(--spacing) * 8);
  background: transparent;
}
.hyt-chat-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  max-width: 440px;
  text-align: center;
}
.hyt-chat-empty-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 6%, transparent);
  color: var(--v2-icon-icon-muted);
}
.hyt-chat-empty-title {
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-normal);
  color: var(--v2-text-text-base);
}
.hyt-chat-empty-body {
  font-size: var(--font-size-small);
  line-height: var(--line-height-x-large);
  color: var(--v2-text-text-muted);
}
.hyt-chat-empty-detail {
  max-width: 100%;
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 5%, transparent);
  color: var(--v2-text-text-faint);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xx-small);
  line-height: var(--line-height-large);
  overflow-wrap: anywhere;
  text-align: left;
}
.hyt-chat-empty-actions { display: flex; align-items: center; gap: calc(var(--spacing) * 2); }

.hyt-chat-viewer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 10);
  border: 0;
  background: color-mix(in srgb, var(--v2-background-bg-layer-04) 82%, transparent);
  cursor: zoom-out;
}
.hyt-chat-viewer img {
  max-width: 92vw;
  max-height: 88vh;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg, 0 24px 64px rgb(0 0 0 / 0.28));
  object-fit: contain;
}

.hyt-chat-to-end {
  position: absolute;
  left: 50%;
  bottom: calc(var(--spacing) * 4);
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: calc(var(--spacing) * 1);
  height: 30px;
  padding: 0 calc(var(--spacing) * 3);
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--v2-background-bg-inverse) 12%, transparent);
  color: var(--v2-text-text-base);
  font-size: var(--font-size-xx-small);
  cursor: pointer;
  box-shadow: var(--v2-elevation-raised, var(--shadow-xs, 0 1px 2px rgb(0 0 0 / 0.08)));
}
@media (hover: hover) {
  .hyt-chat-to-end:hover { background: color-mix(in srgb, var(--v2-background-bg-inverse) 16%, transparent); }
}

@media (max-width: 1180px) {
  .hyt-chat-ai { flex-basis: 260px; }
  .hyt-chat-side { flex-basis: 280px; }
}
@media (max-width: 960px) {
  .hyt-chat-ai { display: none; }
}
`
