/**
 * 聊天主界面的样式。
 *
 * 与 `design/chat-demo.html` 逐条对应，只做三件事：
 * 1. 把 `:root` / `body` 收进 `.hyt-shell`，避免污染宿主应用；
 * 2. 去掉演示切换器的样式；
 * 3. 末尾补上设计稿里靠数据才能触发的几条（折叠、定位闪烁、@ 选人、图片）。
 *
 * 颜色一个都不写死在组件里：深色由 `.hyt-shell[data-theme="dark"]` 覆盖同一组变量。
 */
export const css = `
/* ============================================================================
   值班台账 · 虹云通
   纸白底，页眉一道封红，未读用荧光笔划过摘要。
   日期用仿宋（公文日期），其余系统黑体。全页只让红色出现三次：
   页眉那道线、@ 提醒、分界说明。
   ========================================================================= */
.hyt-shell {
  color-scheme: light;

  --paper: #ffffff;
  --chrome: #f3f5f7;
  --ink: #1b2430;
  --muted: #55636f;
  --line: #e4e8ec;
  --line-soft: #edf0f3;
  --seal: #c33a2e;
  --seal-ink: #b03227;
  --seal-bg: #fbe9e6;
  --mark: #ffe873;
  --bubble: #f2f4f6;
  --bubble-self: #dfeaf4;
  --link: #2e5f8a;

  --face-a-bg: #e6f2e8;
  --face-a-fg: #2f6b3f;
  --face-b-bg: #eceff2;
  --face-b-fg: #4d5a66;

  --hover: #ebeef1;
  --media: #e3e7ea;
  --media-a: #dde8e0;
  --tint: #fafbfc;
  --ink-hover: #2a3542;
  --disabled: #c8d0d7;
  --disabled-ink: #ffffff;
  --online: #3ba55d;
  --sk-1: #eef1f4;
  --sk-2: #f7f9fa;
  --shadow: rgba(27, 36, 48, 0.08);
  --shadow-lg: rgba(27, 36, 48, 0.1);
  /* 弹窗遮罩：浅色压暗、深色压得更狠；不能用 --ink，它在深色下是浅色文字。 */
  --veil: rgba(20, 27, 36, 0.2);
  --focus-ring: rgba(46, 95, 138, 0.16);
  --grip: #c9d1d8;

  --sans: "MiSans", "HarmonyOS Sans SC", "PingFang SC", system-ui, "Microsoft YaHei", sans-serif;
  --ledger: "FangSong", "STFangsong", "仿宋", "FangSong_GB2312", serif;

  --r-row: 8px;
  --r-face: 10px;
  --r-bubble: 12px;
  --r-tip: 4px;

  --rail: 296px;
  --panel: 320px;
  --chrome-h: 62px;

  display: grid;
  position: relative;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  /* 底色跟左栏一致：聊天区的圆角就是从这层底色里挖出来的。 */
  background: var(--chrome);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.hyt-shell[data-panel="open"] {
  grid-template-columns: var(--rail) minmax(0, 1fr) var(--panel);
}

/* 两条栏都没有时整页只有一张纸，不需要再垫一层左栏底色。 */
.hyt-shell[data-blank="true"] { grid-template-columns: minmax(0, 1fr); background: var(--paper); }

.hyt-shell[data-blank="true"] > .rail,
.hyt-shell[data-blank="true"] > .desk,
.hyt-shell[data-blank="true"] > .panel { display: none; }

/* 夜间值班室：不是纯黑，是低亮度的纸灰；红色提亮，荧光笔换成暗金笔迹 */
.hyt-shell[data-theme="dark"] {
  color-scheme: dark;

  --paper: #1a1e23;
  --chrome: #0d1013;
  --ink: #e3e8ed;
  --muted: #96a2ae;
  --line: #303740;
  --line-soft: #262c33;
  --seal: #d7564a;
  --seal-ink: #e88a80;
  --seal-bg: #39221f;
  --mark: #6b5616;
  --bubble: #2a3038;
  --bubble-self: #29384a;
  --link: #86b6da;

  --face-a-bg: #22342a;
  --face-a-fg: #93cfa4;
  --face-b-bg: #2b3138;
  --face-b-fg: #b6c0c9;

  --hover: #1f252b;
  --media: #2f363e;
  --media-a: #26332b;
  --tint: #1f252b;
  --ink-hover: #f0f3f6;
  --disabled: #343a41;
  --disabled-ink: #7c8792;
  --online: #4ecb71;
  --sk-1: #262c33;
  --sk-2: #303740;
  --shadow: rgba(0, 0, 0, 0.45);
  --shadow-lg: rgba(0, 0, 0, 0.5);
  --veil: rgba(4, 6, 8, 0.58);
  --focus-ring: rgba(134, 182, 218, 0.25);
  --grip: #49525c;
}

.hyt-shell,
.hyt-shell *,
.hyt-shell *::before,
.hyt-shell *::after { box-sizing: border-box; }

/* 宿主在插件页外层禁选了文字；聊天正文要能划词复制，控件再逐个关回去。 */
.hyt-shell { user-select: text; }

.hyt-shell button,
.hyt-shell .face,
.hyt-shell .msg-face-btn,
.hyt-shell .msg-meta,
.hyt-shell .stamp,
.hyt-shell .day,
.hyt-shell .badge,
.hyt-shell .menu,
.hyt-shell .profile { user-select: none; }

.hyt-shell ::selection { background: color-mix(in srgb, var(--link) 22%, transparent); }

.hyt-shell[data-theme="dark"] ::selection { background: color-mix(in srgb, var(--link) 32%, transparent); }

.hyt-shell button,
.hyt-shell textarea { font: inherit; color: inherit; }

.hyt-shell :focus-visible {
  outline: 2px solid var(--seal-ink);
  outline-offset: 2px;
}

.hyt-shell .sr-only {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ── 左栏 ─────────────────────────────────────────────────────────────── */
.hyt-shell .rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--chrome);
}

/* 左栏与聊天区之间的拖动手柄：不画线，只在两栏中间露出一枚胶囊。胶囊按整扇窗垂直居中，
   所以要减掉顶栏占的高度，而不是按页面本身居中。命中区 8px 比胶囊宽，方便抓住。
   胶囊三态：平时透明、悬浮或聚焦时变灰、按住拖动时变白并带阴影。 */
.hyt-shell .splitter {
  position: absolute;
  inset-block: 0;
  inset-inline-start: calc(var(--rail) - 4px);
  z-index: 9;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
  outline: none;
  -webkit-app-region: no-drag;
}

.hyt-shell .splitter::after {
  content: "";
  position: absolute;
  inset-block-start: calc(50% - var(--titlebar-height, 48px) / 2);
  inset-inline-start: calc(50% - 1.5px);
  width: 3px;
  height: 40px;
  border-radius: 999px;
  background: var(--grip);
  opacity: 0;
  translate: 0 -50%;
  transition: opacity 120ms ease-out, background-color 120ms ease-out, box-shadow 120ms ease-out;
}

.hyt-shell .splitter:hover::after,
.hyt-shell .splitter:focus-visible::after { opacity: 1; }

.hyt-shell .splitter:focus-visible::after { box-shadow: 0 0 0 2px var(--focus-ring); }

.hyt-shell .splitter[data-dragging="true"]::after {
  background: #fff;
  box-shadow: 0 0 0 0.5px rgb(0 0 0 / 8%), 0 1px 4px rgb(0 0 0 / 14%);
  opacity: 1;
}

/* 拖动中整页不选中文字、光标保持双向箭头，鼠标移出分隔线也不丢拖拽。 */
.hyt-shell[data-resizing="true"] { user-select: none; cursor: col-resize; }

.hyt-shell .brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  height: var(--chrome-h);
  padding: 0 16px 0 20px;
  border-bottom: 2px solid var(--seal);
  overflow: hidden;
}

.hyt-shell .brand-text { min-width: 0; }

.hyt-shell .brand-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.hyt-shell .brand-sub {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 顶栏右侧：未读总数与一键已读。窄栏时只让副标题让位，控件不换行。 */
.hyt-shell .brand-tools {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  white-space: nowrap;
}

.hyt-shell .brand-count {
  color: var(--seal-ink);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.hyt-shell .brand-readall {
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.hyt-shell .brand-readall:hover { border-color: var(--muted); color: var(--ink); }

.hyt-shell .search {
  position: relative;
  flex: 0 0 auto;
  margin: 12px 16px 0;
}

.hyt-shell .search input {
  width: 100%;
  height: 38px;
  padding: 0 52px 0 12px;
  border: 1px solid transparent;
  border-radius: var(--r-row);
  background: var(--paper);
  color: var(--ink);
  font-size: 13px;
}

.hyt-shell .search input::placeholder { color: var(--muted); }

.hyt-shell .search input:focus {
  border-color: var(--muted);
  box-shadow: 0 0 0 2px var(--focus-ring);
  outline: none;
}

.hyt-shell .search kbd {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--muted);
  font-family: inherit;
  font-size: 12px;
  pointer-events: none;
}

.hyt-shell .ledger,
.hyt-shell .hits {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 4px 10px 16px;
  scrollbar-gutter: stable;
}

.hyt-shell .search-empty {
  padding: 28px 12px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.hyt-shell .search-empty strong { display: block; margin-bottom: 4px; color: var(--ink); font-weight: 500; }

.hyt-shell .rail-foot {
  flex: 0 0 auto;
  padding: 10px 20px 14px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.hyt-shell .rail-foot strong { color: var(--ink); font-weight: 500; }

.hyt-shell .rail-foot button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hyt-shell .rail-foot button:hover { color: var(--ink); }
.hyt-shell .rail-foot button:disabled { opacity: 0.45; cursor: not-allowed; }

.hyt-shell .day {
  padding: 16px 8px 4px;
  color: var(--muted);
  font-family: var(--ledger);
  font-size: 13px;
  letter-spacing: 0.03em;
}

.hyt-shell .entry {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: var(--r-row);
  background: transparent;
  text-align: start;
  cursor: pointer;
}

.hyt-shell .entry:not([aria-current="true"]):hover { background: var(--hover); }

/* 头像单独一层：点它看资料，点行里其他位置才是切会话。 */
.hyt-shell .entry-face {
  display: block;
  border-radius: var(--r-face);
  cursor: pointer;
}

.hyt-shell .entry[aria-current="true"] {
  background: var(--paper);
  box-shadow: inset 2px 0 0 var(--seal), inset 0 0 0 1px var(--line);
}

.hyt-shell .face {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-face);
  background: var(--face-b-bg);
  color: var(--face-b-fg);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.02em;
  overflow: hidden;
}

.hyt-shell .face[data-hue="a"] { background: var(--face-a-bg); color: var(--face-a-fg); }

.hyt-shell .face--sm {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  font-size: 12px;
}

.hyt-shell .entry-text { min-width: 0; }

.hyt-shell .entry-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.hyt-shell .entry-kind {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  color: var(--muted);
}

.hyt-shell .entry-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .entry[data-unread="true"] .entry-name { font-weight: 600; }

.hyt-shell .entry-time {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.hyt-shell .entry-line {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-top: 2px;
  min-height: 20px;
}

.hyt-shell .entry-preview {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 荧光笔只涂文字本身，笔迹不满行盒，短句也不会拖一条到行尾 */
.hyt-shell .hl {
  padding: 0 1px;
  background-image: linear-gradient(
    180deg,
    transparent 10%,
    var(--mark) 10%,
    var(--mark) 90%,
    transparent 90%
  );
  box-decoration-break: clone;
  color: var(--ink);
}

.hyt-shell .entry[data-unread="true"] .entry-preview { color: var(--ink); }

.hyt-shell .draft-mark {
  margin-right: 5px;
  color: var(--seal-ink);
  font-size: 12px;
}

.hyt-shell .badge {
  flex: 0 0 auto;
  width: 18px;
  margin-left: 8px;
  color: var(--seal-ink);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.hyt-shell .badge--count {
  border-radius: 9px;
  background: var(--ink);
  color: var(--paper);
  font-weight: 500;
  text-align: center;
}

/* 搜索结果 */
.hyt-shell .hit {
  display: block;
  width: 100%;
  padding: 9px 8px;
  border: 0;
  border-radius: var(--r-row);
  background: transparent;
  text-align: start;
  cursor: pointer;
}

.hyt-shell .hit:hover { background: var(--hover); }

.hyt-shell .hit-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.hyt-shell .hit-name { flex: 1 1 auto; font-size: 13px; font-weight: 500; }
.hyt-shell .hit-time { flex: 0 0 auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

.hyt-shell .hit-text {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .hit mark { padding: 0 2px; background: var(--mark); color: var(--ink); }

.hyt-shell .hits-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 14px 8px 6px;
  color: var(--muted);
  font-size: 12px;
}

.hyt-shell .hits-head b { color: var(--ink); font-weight: 500; }

/* ── 中栏 ─────────────────────────────────────────────────────────────── */
.hyt-shell .desk {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--paper);
  /* 聊天区是浮在左栏底色上的一张纸：抬起左上角、给一道很淡的边影，和目录分开。 */
  border-top-left-radius: 12px;
  box-shadow: -1px 0 0 var(--line-soft), -6px 0 14px -10px var(--shadow);
  overflow: hidden;
}

.hyt-shell .head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  height: var(--chrome-h);
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--line);
}

.hyt-shell .head-face {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: var(--r-face);
  background: var(--face-a-bg);
  color: var(--face-a-fg);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
}

.hyt-shell .head-text { min-width: 0; }

.hyt-shell .head-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.hyt-shell .head-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .head-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.hyt-shell .pill {
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 12px;
  line-height: 16px;
}

.hyt-shell .head-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.hyt-shell .icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: var(--r-row);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.hyt-shell .icon-btn:hover { background: var(--chrome); color: var(--ink); }
.hyt-shell .icon-btn svg { width: 17px; height: 17px; }

.hyt-shell .stream-wrap {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.hyt-shell .stream {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0 28px;
  scrollbar-gutter: stable;
}

.hyt-shell .flow {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  justify-content: flex-end;
  padding-bottom: 46px;
}

.hyt-shell .more {
  align-self: center;
  margin: 14px 0 4px;
  padding: 2px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .more:hover { background: var(--chrome); color: var(--ink); }
.hyt-shell .more:disabled { cursor: default; opacity: 0.7; }

.hyt-shell .stamp {
  margin: 10px 0 18px;
  color: var(--muted);
  font-family: var(--ledger);
  font-size: 13px;
  letter-spacing: 0.04em;
  text-align: center;
}

.hyt-shell .system {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.hyt-shell .system b { color: var(--ink); font-weight: 500; }

.hyt-shell .divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 20px 0 16px;
  color: var(--seal-ink);
  font-size: 12px;
}

.hyt-shell .divider::before,
.hyt-shell .divider::after {
  content: "";
  flex: 0 0 28px;
  height: 1px;
  background: var(--seal-bg);
}

.hyt-shell .msg {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  /* 行距只有两档：同一个人连续发言留一道窄缝，换人或隔了 5 分钟以上空出一段。
     不用隐藏的 meta 撑间距——grouped 消息根本不渲染 meta，否则气泡会贴死。 */
  margin: 0;
  border-radius: 10px;
  outline: none;
}

/* 新的一组：换人，或者距上一条超过 5 分钟。 */
.hyt-shell .msg:not([data-grouped="true"]) { margin-top: 8px; }

/* 组内：同人连续的文字、文件、图片之间留一道缝，不能贴成一块。
   组头自带 24px 的 meta，所以组间看起来约 32px，这里 12px 仍紧于换人。 */
.hyt-shell .msg[data-grouped="true"] { margin-top: 12px; }

/* 消息行本身可以被键盘聚焦（Shift+F10 开菜单），聚焦只给一圈浅环，不抢气泡的颜色。 */
.hyt-shell .msg:focus-visible { box-shadow: 0 0 0 2px var(--focus-ring); }

.hyt-shell .msg-face-btn {
  display: block;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--r-face);
  background: none;
  cursor: pointer;
}

.hyt-shell .msg-face {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-face);
  background: var(--face-b-bg);
  color: var(--face-b-fg);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
}

.hyt-shell .msg-face[data-hue="a"] { background: var(--face-a-bg); color: var(--face-a-fg); }

.hyt-shell .msg-body { min-width: 0; }

.hyt-shell .msg-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 3px;
}

.hyt-shell .msg-name { font-size: 13px; font-weight: 500; }

.hyt-shell .msg-time {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 连续同人：头像位保留，隐去重复的头像与名字，整块收紧 */
.hyt-shell .msg[data-grouped="true"] .msg-face,
.hyt-shell .msg[data-grouped="true"] .msg-face-btn,
.hyt-shell .msg[data-grouped="true"] .msg-meta { visibility: hidden; }

.hyt-shell .bubble {
  display: inline-block;
  max-width: min(780px, 86%);
  padding: 8px 13px;
  border-radius: var(--r-bubble);
  border-top-left-radius: var(--r-tip);
  background: var(--bubble);
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.hyt-shell .bubble--block { display: block; }
.hyt-shell .bubble--w { width: min(420px, 100%); }
.hyt-shell .bubble--prose { width: min(560px, 100%); }

.hyt-shell .bubble a { color: var(--link); text-underline-offset: 2px; }

.hyt-shell .at {
  padding: 0 4px;
  border-radius: var(--r-tip);
  background: var(--seal-bg);
  color: var(--seal-ink);
  font-weight: 500;
}

.hyt-shell .msg[data-self="true"] {
  grid-template-columns: minmax(0, 1fr);
}

.hyt-shell .msg[data-self="true"] .msg-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.hyt-shell .msg[data-self="true"] .bubble {
  border-top-left-radius: var(--r-bubble);
  border-top-right-radius: var(--r-tip);
  background: var(--bubble-self);
}

.hyt-shell .msg[data-self="true"] .msg-meta { align-self: flex-end; }

/* 回执入口：气泡右下一行小字，只有自己发出的消息才有。它是常驻说明，不是悬浮工具，
   所以不占额外高度，也不随悬浮显示/隐藏。 */
.hyt-shell .receipt-line {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}

.hyt-shell .receipt-line:hover { color: var(--link); }
.hyt-shell .receipt-line b { color: var(--link); font-weight: 500; }
/* 补不回来的回执仍然可以点开看说明与重试，只是不抢注意力。 */
.hyt-shell .receipt-line[data-kind="unavailable"] { color: var(--muted); }
.hyt-shell .receipt-line[data-kind="unavailable"]:hover { color: var(--ink); }

/* 回执弹窗：遮罩只压暗一点，弹窗与整页同一张纸，靠边框和阴影分层。 */
.hyt-shell .receipt-veil {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--veil);
}

.hyt-shell .receipt {
  display: flex;
  flex-direction: column;
  width: min(380px, 100%);
  max-height: min(560px, 100%);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-bubble);
  background: var(--paper);
  box-shadow: 0 18px 48px -24px var(--shadow-lg);
  outline: none;
}

.hyt-shell .receipt-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 12px 14px 9px;
}

.hyt-shell .receipt-head strong { font-size: 14px; font-weight: 600; }

.hyt-shell .receipt-head .sum {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.hyt-shell .receipt-head .x {
  margin-left: auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
}

.hyt-shell .receipt-head .x:hover { background: var(--hover); color: var(--ink); }

.hyt-shell .receipt-search {
  margin: 0 14px 8px;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--tint);
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
}

.hyt-shell .receipt-search::placeholder { color: var(--muted); }

.hyt-shell .receipt-body { overflow-y: auto; padding: 0 6px 8px; }

.hyt-shell .pgroup {
  margin: 6px 8px 2px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.hyt-shell .people { margin: 0; padding: 0; list-style: none; }

.hyt-shell .people li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 5px 8px;
  border-radius: 6px;
}

.hyt-shell .people li:hover { background: var(--hover); }

.hyt-shell .pface {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--r-row);
  background: var(--face-b-bg);
  color: var(--face-b-fg);
  font-size: 10px;
  font-weight: 600;
  overflow: hidden;
}

.hyt-shell .pface[data-hue="a"] { background: var(--face-a-bg); color: var(--face-a-fg); }
.hyt-shell .people li[data-unread="true"] .pface { background: var(--hover); color: var(--muted); }

.hyt-shell .pname {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .pside { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }

.hyt-shell .receipt-state {
  margin: 0;
  padding: 16px 14px 18px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.hyt-shell .receipt-state p { margin: 0 0 10px; }

.hyt-shell .receipt-retry {
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.hyt-shell .receipt-retry:hover { background: var(--hover); }

.hyt-shell .receipt-foot {
  padding: 8px 14px 11px;
  border-top: 1px solid var(--line-soft);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.hyt-shell .expand {
  display: block;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font-size: 13px;
  cursor: pointer;
}

/* 文件卡：气泡里的子块，用一条淡线分隔，不套第二层卡片 */
.hyt-shell .file {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid color-mix(in srgb, var(--ink) 9%, transparent);
}

.hyt-shell .file-mark {
  display: grid;
  place-items: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--paper);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}

.hyt-shell .file-text { min-width: 0; overflow: hidden; }

.hyt-shell .file-name {
  display: block;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .file-size {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 图片 */
.hyt-shell .shots {
  display: grid;
  gap: 3px;
  width: 100%;
  margin-top: 9px;
  overflow: hidden;
  border-radius: var(--r-row);
}

.hyt-shell .shot {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  background: var(--media);
  color: var(--muted);
  font-size: 12px;
}

.hyt-shell .shot[data-hue="a"] { background: var(--media-a); }

/* 语音 / 通话 / 合并转发 */
.hyt-shell .capsule {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 132px;
  padding: 7px 12px;
  border-radius: var(--r-bubble);
  border-top-left-radius: var(--r-tip);
  background: var(--bubble);
  font-size: 14px;
}

.hyt-shell .capsule button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .capsule .hint { color: var(--muted); font-size: 12px; }

.hyt-shell .capsule .wave { display: flex; align-items: center; gap: 2px; }

.hyt-shell .capsule .wave i {
  width: 2px;
  height: 10px;
  background: var(--muted);
  border-radius: 1px;
}

.hyt-shell .capsule .wave i:nth-child(2) { height: 15px; }
.hyt-shell .capsule .wave i:nth-child(3) { height: 7px; }
.hyt-shell .capsule .wave i:nth-child(4) { height: 12px; }

.hyt-shell .merge-card {
  display: block;
  width: min(320px, 100%);
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-row);
  background: var(--paper);
  text-align: start;
  cursor: pointer;
}

.hyt-shell .merge-card:hover { background: var(--chrome); }

/* ── 应用消息卡片 
   外部系统（观测服务等）推送的告警/通知：纸色留白 + 细边框，
   字段按登记单排成「标签 | 值」两列，长文本自然换行，不用气泡形状。 */
.hyt-shell .app-card {
  width: min(520px, 100%);
  padding: 14px 16px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-row);
  background: var(--tint);
}

.hyt-shell .app-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.hyt-shell .app-card-name { color: var(--muted); font-size: 12px; }

.hyt-shell .app-card-tag {
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}

.hyt-shell .app-card-title {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
}

.hyt-shell .app-card-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.hyt-shell .app-card-field {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}

.hyt-shell .app-card-field dt { color: var(--muted); font-size: 12px; }

.hyt-shell .app-card-field dd {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.hyt-shell .app-card-more {
  margin-top: 10px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.hyt-shell .app-card-more:hover { text-decoration: underline; }

.hyt-shell .merge-title { font-size: 13px; font-weight: 500; }
.hyt-shell .merge-text {
  margin-top: 3px;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .unknown {
  display: inline-block;
  padding: 8px 13px;
  border: 1px dashed var(--line);
  border-radius: var(--r-bubble);
  color: var(--muted);
  font-size: 13px;
}

.hyt-shell .unknown b { color: var(--ink); font-weight: 500; }

/* 回到底部 */
.hyt-shell .jump {
  position: absolute;
  right: 22px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper);
  box-shadow: 0 2px 10px var(--shadow);
  color: var(--ink);
  font-size: 13px;
  cursor: pointer;
}

/* ── 输入区 ───────────────────────────────────────────────────────────── */
.hyt-shell .composer {
  flex: 0 0 auto;
  padding: 10px 20px 14px;
  border-top: 1px solid var(--line);
  background: var(--paper);
}

.hyt-shell .ai-draft {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-left: 2px solid var(--seal);
  background: var(--tint);
}

.hyt-shell .ai-draft-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.hyt-shell .ai-draft-head span { color: var(--muted); font-size: 12px; font-weight: 400; }

.hyt-shell .ai-draft-text {
  margin: 4px 0 8px;
  max-width: 62ch;
  font-size: 14px;
  line-height: 1.6;
}

.hyt-shell .ai-draft-actions { display: flex; gap: 6px; }

.hyt-shell .draft-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink);
  font-size: 12px;
  cursor: pointer;
}

.hyt-shell .draft-btn:hover { border-color: var(--muted); }

.hyt-shell .draft-btn[data-primary="true"] {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
}

.hyt-shell .draft-btn[data-primary="true"]:hover { background: var(--ink-hover); }

.hyt-shell .send-note {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 12px;
}

.hyt-shell .send-note b { color: var(--ink); font-weight: 500; }
.hyt-shell .send-note button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font-size: 12px;
  cursor: pointer;
}

.hyt-shell .send-note-extra { margin-left: auto; opacity: 0.85; }

.hyt-shell .box {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--r-row);
  background: var(--chrome);
}

.hyt-shell .box:focus-within { border-color: var(--muted); background: var(--paper); }

.hyt-shell .box textarea {
  display: block;
  width: 100%;
  min-height: 62px;
  max-height: 148px;
  padding: 10px 12px 0;
  border: 0;
  background: transparent;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.hyt-shell .box textarea::placeholder { color: var(--muted); }

.hyt-shell .box[data-locked="true"] textarea { cursor: not-allowed; }

.hyt-shell .tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px 8px;
}

.hyt-shell .tool {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.hyt-shell .tool:hover:not(:disabled) { background: var(--paper); color: var(--ink); }
.hyt-shell .tool:disabled { opacity: 0.45; cursor: not-allowed; }
.hyt-shell .tool svg { width: 16px; height: 16px; }

.hyt-shell .tools-hint {
  margin-left: 8px;
  color: var(--muted);
  font-size: 12px;
}

.hyt-shell .send {
  height: 28px;
  margin-left: auto;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: var(--ink);
  color: var(--paper);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .send:disabled { background: var(--disabled); color: var(--disabled-ink); cursor: not-allowed; }

/* ── 右侧资料 ─────────────────────────────────────────────────────────── */
.hyt-shell .panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--paper);
  border-left: 1px solid var(--line);
}

.hyt-shell .panel[hidden] { display: none; }

.hyt-shell .panel-head {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  height: var(--chrome-h);
  padding: 0 10px 0 20px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  font-weight: 600;
}

.hyt-shell .panel-head .icon-btn { margin-left: auto; }

.hyt-shell .panel-body { flex: 1 1 auto; overflow: auto; padding: 18px 20px 24px; }

.hyt-shell .subject {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.hyt-shell .subject-name { margin: 0; font-size: 15px; font-weight: 600; }
.hyt-shell .subject-meta { color: var(--muted); font-size: 12px; }

.hyt-shell .section {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 20px 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.hyt-shell .section span { color: var(--muted); font-size: 12px; font-weight: 400; }

.hyt-shell .person {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.hyt-shell .person-name { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.hyt-shell .person-role { color: var(--muted); font-size: 12px; }

.hyt-shell .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--online);
}

.hyt-shell .panel-note {
  margin: 22px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

/* ── 独立视图：空态 / 加载 / 错误 ─────────────────────────────────────── */
.hyt-shell .blank {
  position: relative;
  display: grid;
  place-items: center;
  padding: 40px 32px;
  background: var(--paper);
}

.hyt-shell .blank[hidden] { display: none; }

.hyt-shell .blank-brand {
  position: absolute;
  top: 22px;
  left: 32px;
  color: var(--muted);
  font-size: 13px;
}

/* 加载态画成外壳骨架，而不是整页一个转圈 */
.hyt-shell .blank--frame {
  grid-template-columns: var(--rail) minmax(0, 1fr);
  place-items: stretch;
  padding: 0;
}

.hyt-shell .sk-rail {
  padding: 22px 20px;
  border-right: 1px solid var(--line);
  background: var(--chrome);
}

.hyt-shell .sk-desk { display: flex; flex-direction: column; padding: 22px 28px 40px; }

.hyt-shell .sk-desk .inner {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  margin-top: auto;
}

.hyt-shell .sk-hint {
  margin: auto;
  color: var(--muted);
  font-size: 13px;
}

.hyt-shell .blank-inner {
  width: min(520px, 100%);
  padding-left: 20px;
  border-left: 2px solid var(--seal);
}

.hyt-shell .blank-title { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
.hyt-shell .blank-body { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.75; }
.hyt-shell .blank-body code { font-family: inherit; color: var(--ink); }

.hyt-shell .blank-actions { display: flex; align-items: center; gap: 10px; }

/* 登录页：一张值班登记单。整页纸色，内容靠左，装订线是一道封红。 */
.hyt-shell .blank--auth {
  place-items: center start;
  padding: 0 clamp(32px, 11vw, 148px);
}

.hyt-shell .blank--auth .blank-inner { width: min(440px, 100%); }

.hyt-shell .blank--auth .blank-title {
  margin-bottom: 10px;
  font-size: 24px;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.hyt-shell .blank--auth .blank-body {
  max-width: 46ch;
  margin-bottom: 28px;
  font-size: 14px;
  line-height: 1.8;
}

/* 表单按纸质登记单排：字段之间用留白分开，输入区只有一条下划线，聚焦时下划线变封红。 */
.hyt-shell .login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 18px;
}

.hyt-shell .login-field { display: flex; flex-direction: column; gap: 8px; }

.hyt-shell .login-label { color: var(--muted); font-size: 12px; letter-spacing: 0.02em; }

.hyt-shell .login-input {
  width: 100%;
  height: 40px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 15px;
}

.hyt-shell .login-input::placeholder { color: var(--muted); opacity: 0.7; }

.hyt-shell .login-input:focus {
  border-bottom-color: var(--seal);
  outline: none;
}

.hyt-shell .login-input:disabled { color: var(--muted); cursor: not-allowed; }

.hyt-shell .button:disabled { opacity: 0.45; cursor: not-allowed; }

/* 失败原因按批注排：左侧一道封红，底色是淡淡的一层，不抢标题的位置。 */
.hyt-shell .login-error {
  margin: 0;
  padding: 10px 12px;
  border-left: 2px solid var(--seal);
  border-radius: 0 var(--r-tip) var(--r-tip) 0;
  background: var(--seal-bg);
  color: var(--seal-ink);
  font-size: 13px;
  line-height: 1.7;
}

/* 排查信息默认收起，登录页只留账号、密码与登录。 */
.hyt-shell .login-meta {
  margin-top: 26px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.8;
}

.hyt-shell .login-meta summary { cursor: pointer; }

.hyt-shell .login-meta p { margin: 8px 0 0; }

.hyt-shell .login-meta code {
  color: var(--ink);
  font-family: inherit;
  word-break: break-all;
}

/* 主界面顶部的「通道未登录」提示：不挡内容，只把失败原因和登录入口摆在眼前。 */
.hyt-shell .auth-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  padding: 8px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--chrome);
  color: var(--seal-ink);
  font-size: 13px;
  line-height: 1.6;
}

.hyt-shell .auth-banner span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .auth-banner button { flex: 0 0 auto; }

.hyt-shell .button {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: var(--ink);
  color: var(--paper);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .button:hover { background: var(--ink-hover); }

.hyt-shell .ghost {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .ghost:hover { border-color: var(--muted); color: var(--ink); }

.hyt-shell details.tech { margin-top: 16px; color: var(--muted); font-size: 12px; }
.hyt-shell details.tech summary { cursor: pointer; }
.hyt-shell details.tech pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 6px;
  background: var(--chrome);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.6;
}

/* 骨架 */
.hyt-shell .sk {
  height: 12px;
  margin-bottom: 10px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--sk-1), var(--sk-2), var(--sk-1));
  background-size: 200% 100%;
  animation: hyt-sk 1.4s linear infinite;
}
.hyt-shell .sk.w60 { width: 60%; }
.hyt-shell .sk.w40 { width: 40%; }
.hyt-shell .sk.w80 { width: 80%; }
.hyt-shell .sk.tall { height: 56px; border-radius: var(--r-bubble); }

@keyframes hyt-sk { from { background-position: 0 0; } to { background-position: -200% 0; } }

.hyt-shell [hidden] { display: none !important; }

/* ── 产品补充：设计稿里靠交互才出现的东西 ─────────────────────────────── */

/* 长文先折六行，展开按钮接管剩余内容。按钮不能一起被裁掉，所以裁的是里面的文字块。 */
.hyt-shell .bubble-text {
  display: inline;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.hyt-shell .bubble-text[data-clamped="true"] {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  overflow: hidden;
}

/* 从搜索结果或「定位」跳过来时，目标消息闪一下，眼睛能接住 */
.hyt-shell .msg[data-flash="true"] .bubble,
.hyt-shell .msg[data-flash="true"] .merge-card,
.hyt-shell .msg[data-flash="true"] .capsule,
.hyt-shell .msg[data-flash="true"] .unknown {
  animation: hyt-flash 1.6s ease-out;
}

@keyframes hyt-flash {
  0%, 40% { box-shadow: 0 0 0 2px var(--seal); }
  100% { box-shadow: 0 0 0 2px transparent; }
}

/* 图片真的读出来以后铺满格子 */
.hyt-shell .shot {
  padding: 0;
  border: 0;
  cursor: pointer;
}

.hyt-shell .shot:disabled { cursor: default; }

.hyt-shell .shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hyt-shell .face img,
.hyt-shell .msg-face img,
.hyt-shell .head-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 合并转发展开后直接在气泡下方列消息，不再开二级窗口 */
.hyt-shell .merge-list {
  width: min(420px, 100%);
  margin-top: 6px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-row);
  background: var(--paper);
  font-size: 13px;
}

.hyt-shell .merge-item { padding: 4px 0; }
.hyt-shell .merge-item + .merge-item { border-top: 1px solid var(--line-soft); }
.hyt-shell .merge-item b { font-weight: 500; }
.hyt-shell .merge-item span { display: block; color: var(--muted); }

.hyt-shell .merge-error { margin-top: 6px; color: var(--seal-ink); font-size: 12px; }

/* @ 选人：挂在输入框上方，键盘也能选 */
.hyt-shell .mention-pop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 5;
  width: min(260px, 100%);
  max-height: 220px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--r-row);
  background: var(--paper);
  box-shadow: 0 8px 24px var(--shadow-lg);
}

.hyt-shell .mention-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  text-align: start;
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .mention-item:hover,
.hyt-shell .mention-item[data-active="true"] { background: var(--hover); }
.hyt-shell .mention-item small { color: var(--muted); font-size: 12px; }

.hyt-shell .mention-empty { padding: 10px 8px; color: var(--muted); font-size: 12px; }

.hyt-shell .attach-error { margin-top: 6px; color: var(--seal-ink); font-size: 12px; }

/* 右键菜单：跟随指针弹出，贴边由 menu.tsx 在渲染后夹进视口。条目 28px，与宿主菜单同规格。 */
.hyt-shell .menu {
  position: fixed;
  z-index: 60;
  min-width: 176px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  box-shadow: 0 10px 30px var(--shadow-lg), 0 1px 3px var(--shadow);
  outline: none;
}

.hyt-shell .menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--ink);
  font-size: 13px;
  text-align: start;
  cursor: pointer;
}

.hyt-shell .menu-item[data-active="true"] { background: var(--hover); }

.hyt-shell .menu-rule { height: 1px; margin: 4px 2px; background: var(--line); }

/* 用户卡片：点头像浮出，Esc 或点外部关闭，焦点回到头像。 */
.hyt-shell .profile {
  position: fixed;
  z-index: 60;
  width: 244px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  box-shadow: 0 10px 30px var(--shadow-lg), 0 1px 3px var(--shadow);
  outline: none;
}

.hyt-shell .profile-who {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.hyt-shell .profile-face {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  font-size: 15px;
}

.hyt-shell .profile-id { min-width: 0; }

.hyt-shell .profile-name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .profile-state {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
}

.hyt-shell .profile-state::before {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--muted);
}

.hyt-shell .profile-state[data-online="true"] { color: var(--online); }
.hyt-shell .profile-state[data-online="true"]::before { background: var(--online); }

.hyt-shell .profile-account {
  margin-top: 2px;
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hyt-shell .profile-dept {
  margin-top: 2px;
  color: var(--muted);
  font-size: 12px;
}

.hyt-shell .profile-actions {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}

.hyt-shell .profile-primary {
  flex: 1 1 auto;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: var(--ink);
  color: var(--paper);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .profile-primary:hover { background: var(--ink-hover); }

.hyt-shell .profile-ghost {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.hyt-shell .profile-ghost:hover { border-color: var(--muted); color: var(--ink); }

.hyt-shell .profile-note {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 1024px) {
  .hyt-shell[data-panel="open"] { grid-template-columns: var(--rail) minmax(0, 1fr); }
  .hyt-shell .panel { position: fixed; top: 0; right: 0; bottom: 0; width: var(--panel); z-index: 30; box-shadow: -10px 0 30px var(--shadow-lg); }
}

@media (max-width: 760px) {
  .hyt-shell { grid-template-columns: minmax(0, 1fr); }
  .hyt-shell .rail { display: none; }
  .hyt-shell .splitter { display: none; }
  /* 没有左栏时聊天区铺满整扇窗，不再需要从底色里浮起来。 */
  .hyt-shell .desk { border-top-left-radius: 0; box-shadow: none; }
  .hyt-shell .stream { padding: 0 16px; }
  .hyt-shell .composer { padding: 8px 12px 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .hyt-shell *,
  .hyt-shell *::before,
  .hyt-shell *::after { animation: none !important; transition: none !important; }
}

@media print {
  .hyt-shell { height: auto; }
  .hyt-shell .stream,
  .hyt-shell .ledger,
  .hyt-shell .panel-body { overflow: visible; }
  .hyt-shell .hl,
  .hyt-shell .at,
  .hyt-shell .badge--count,
  .hyt-shell .brand { print-color-adjust: exact; }
}
`
