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
   值班台账 · 企业内部通讯
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
  --focus-ring: rgba(46, 95, 138, 0.16);

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
  grid-template-columns: var(--rail) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.hyt-shell[data-panel="open"] {
  grid-template-columns: var(--rail) minmax(0, 1fr) var(--panel);
}

.hyt-shell[data-blank="true"] { grid-template-columns: minmax(0, 1fr); }

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
  --focus-ring: rgba(134, 182, 218, 0.25);
}

.hyt-shell,
.hyt-shell *,
.hyt-shell *::before,
.hyt-shell *::after { box-sizing: border-box; }

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
  border-right: 1px solid var(--line);
}

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

.hyt-shell .brand-unread {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--seal-ink);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
}

.hyt-shell .brand-unread:hover { text-decoration: underline; text-underline-offset: 3px; }

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
  margin-bottom: 14px;
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
.hyt-shell .msg[data-grouped="true"] { margin-top: -8px; margin-bottom: 8px; }
.hyt-shell .msg[data-grouped="true"] .msg-face,
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

.hyt-shell .message-tools {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
  opacity: 0;
  transition: opacity 120ms ease-out;
}

.hyt-shell .msg:hover .message-tools,
.hyt-shell .msg:focus-within .message-tools { opacity: 1; }

.hyt-shell .message-tools button {
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.hyt-shell .message-tools button:hover { background: var(--chrome); color: var(--ink); }

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
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  width: min(320px, 100%);
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

@media (max-width: 1024px) {
  .hyt-shell[data-panel="open"] { grid-template-columns: var(--rail) minmax(0, 1fr); }
  .hyt-shell .panel { position: fixed; top: 0; right: 0; bottom: 0; width: var(--panel); z-index: 30; box-shadow: -10px 0 30px var(--shadow-lg); }
}

@media (max-width: 760px) {
  .hyt-shell { grid-template-columns: minmax(0, 1fr); }
  .hyt-shell .rail { display: none; }
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
