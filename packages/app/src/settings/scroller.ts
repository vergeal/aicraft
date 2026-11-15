/** The element that scrolls a settings page: the page's own panel in a dialog, .settings-content otherwise. */
export function settingsScroller(panel: HTMLElement) {
  if (getComputedStyle(panel).overflowY !== "visible") return panel

  return panel.closest<HTMLElement>(".settings-content") ?? panel
}
