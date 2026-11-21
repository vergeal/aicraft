/* 模块设计图的共享脚本：注入图标 sprite、切换默认/空态/交互态、1024 折叠态、A 标注。 */
const sprite = `
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <defs>
    <linearGradient id="brand-ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color: var(--p-green-400)" />
      <stop offset="0.55" style="stop-color: var(--p-green-500)" />
      <stop offset="1" style="stop-color: var(--p-blue-400)" />
    </linearGradient>
    <symbol id="i-brand" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" stroke="none" style="fill: var(--p-green-400)" />
    </symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
    <symbol id="i-inbox" viewBox="0 0 24 24">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </symbol>
    <symbol id="i-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </symbol>
    <symbol id="i-book" viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </symbol>
    <symbol id="i-compass" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2.5 6.5L7 17l2.5-6.5Z" />
    </symbol>
    <symbol id="i-search" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </symbol>
    <symbol id="i-filter" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2v-8.54Z" /></symbol>
    <symbol id="i-folder-plus" viewBox="0 0 24 24">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M12 10v6M9 13h6" />
    </symbol>
    <symbol id="i-folder-open" viewBox="0 0 24 24">
      <path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
    </symbol>
    <symbol id="i-folder" viewBox="0 0 24 24">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </symbol>
    <symbol id="i-bubble" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
    </symbol>
    <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></symbol>
    <symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></symbol>
    <symbol id="i-more" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" />
    </symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></symbol>
    <symbol id="i-message" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </symbol>
    <symbol id="i-alert" viewBox="0 0 24 24">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </symbol>
    <symbol id="i-doc" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </symbol>
    <symbol id="i-trash" viewBox="0 0 24 24">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </symbol>
    <symbol id="i-pause" viewBox="0 0 24 24"><path d="M9 4v16M15 4v16" /></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="m6 3 15 9-15 9Z" /></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </symbol>
    <symbol id="i-import" viewBox="0 0 24 24">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </symbol>
    <symbol id="i-puzzle" viewBox="0 0 24 24">
      <path d="M19.4 14a2 2 0 0 0 0-4h-2V7a2 2 0 0 0-2-2h-3V3.6a2 2 0 1 0-4 0V5H5a2 2 0 0 0-2 2v3h1.6a2 2 0 1 1 0 4H3v3a2 2 0 0 0 2 2h3v1.4a2 2 0 1 0 4 0V19h3a2 2 0 0 0 2-2v-3Z" />
    </symbol>
    <symbol id="i-lock" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </symbol>
    <symbol id="i-file" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </symbol>
    <symbol id="i-info" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </symbol>
    <symbol id="i-collapse" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </symbol>
    <symbol id="i-panel" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M15 4v16" />
    </symbol>
    <symbol id="i-sparkle" viewBox="0 0 24 24">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
    </symbol>
    <symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
    <symbol id="i-terminal" viewBox="0 0 24 24">
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </symbol>
  </defs>
</svg>`

document.body.insertAdjacentHTML("afterbegin", sprite)

const windowEl = document.getElementById("window")
const moduleEl = document.querySelector(".module")
const modeButtons = [...document.querySelectorAll("[data-mode-button]")]

const setMode = (mode) => {
  moduleEl.dataset.mode = mode
  document.body.dataset.mode = mode
  for (const button of modeButtons) {
    button.setAttribute("aria-selected", String(button.dataset.modeButton === mode))
  }
  window.pageMode?.(mode)
}

for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.modeButton))
}

// 便于逐屏审：inbox.html?mode=empty、?mode=interact、?collapse=1
const params = new URLSearchParams(location.search)
if (params.get("mode")) setMode(params.get("mode"))

const collapseButton = document.querySelector("[data-collapse-button]")
const syncCollapse = () => {
  const narrow = innerWidth <= 1024
  const forced = collapseButton.getAttribute("aria-pressed") === "true"
  windowEl.dataset.collapse = narrow || forced ? "on" : "off"
  collapseButton.hidden = narrow
}
if (params.get("collapse") === "1") collapseButton.setAttribute("aria-pressed", "true")
collapseButton.addEventListener("click", () => {
  const next = collapseButton.getAttribute("aria-pressed") !== "true"
  collapseButton.setAttribute("aria-pressed", String(next))
  syncCollapse()
})
addEventListener("resize", syncCollapse)
syncCollapse()

const annotateButton = document.querySelector("[data-annotate-button]")
const syncAnnotate = () => {
  const on = document.body.classList.toggle("annotate")
  annotateButton?.setAttribute("aria-pressed", String(on))
}
annotateButton?.addEventListener("click", syncAnnotate)

addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === "a" || event.key === "A") syncAnnotate()
  if (event.key === "1") setMode("default")
  if (event.key === "2") setMode("empty")
  if (event.key === "3") setMode("interact")
})
