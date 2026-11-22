/**
 * 插件自己画的少数部件：状态点、场景卡、标签与引导层。
 * 颜色、字号、间距、圆角全部走产品已有的语义变量，深浅色由变量自己跟随主题。
 */
export const css = `
.hyt-status {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  font-size: var(--font-size-small);
  color: var(--v2-text-text-muted);
}
.hyt-status[data-state="ready"] { color: var(--v2-text-text-base); }
.hyt-status[data-state="failed"] { color: var(--v2-state-fg-danger); }
.hyt-status-dot {
  width: calc(var(--spacing) * 1.5);
  height: calc(var(--spacing) * 1.5);
  border-radius: 999px;
  background: var(--v2-icon-icon-muted);
}
.hyt-status[data-state="ready"] .hyt-status-dot { background: var(--v2-system-accent); }
.hyt-status[data-state="failed"] .hyt-status-dot { background: var(--v2-state-fg-danger); }
.hyt-status[data-state="connecting"] .hyt-status-dot,
.hyt-status[data-state="restarting"] .hyt-status-dot {
  background: var(--v2-system-accent);
  animation: hyt-pulse 1.4s ease-in-out infinite;
}
@keyframes hyt-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.hyt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 1.5);
  justify-content: flex-end;
}
.hyt-chip {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--spacing) * 1);
  max-width: 22rem;
  padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2);
  border: 1px solid var(--v2-border-border-base);
  border-radius: 999px;
  background: var(--v2-background-bg-layer-02);
  color: var(--v2-text-text-base);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-compact);
}
.hyt-chip[data-muted="true"] {
  border-color: var(--v2-border-border-muted);
  background: transparent;
  color: var(--v2-text-text-muted);
}
.hyt-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
  border: 0;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--v2-icon-icon-muted);
  cursor: pointer;
}
.hyt-chip-remove:hover {
  background: var(--v2-overlay-simple-overlay-hover);
  color: var(--v2-text-text-base);
}
.hyt-chip-remove:focus-visible {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 1px;
}

.hyt-summary {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
  max-width: 34rem;
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
  white-space: pre-wrap;
}
.hyt-summary-line { color: var(--v2-text-text-muted); }
.hyt-inline-note {
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-compact);
}
.hyt-error {
  margin-bottom: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border: 1px solid color-mix(in srgb, var(--v2-state-fg-danger) 40%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--v2-state-fg-danger) 8%, transparent);
  color: var(--v2-state-fg-danger);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
}

.hyt-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--spacing) * 2);
  width: 100%;
}
.hyt-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  padding: calc(var(--spacing) * 3);
  border: 1px solid var(--v2-border-border-muted);
  border-radius: var(--radius-lg);
  background: var(--v2-background-bg-layer-01);
  color: var(--v2-text-text-base);
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.hyt-card:hover {
  border-color: var(--v2-border-border-base);
  background: var(--v2-background-bg-layer-02);
}
.hyt-card:focus-visible {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 1px;
}
.hyt-card[aria-pressed="true"] {
  border-color: var(--v2-system-accent);
  background: color-mix(in srgb, var(--v2-system-accent) 8%, var(--v2-background-bg-layer-01));
}
.hyt-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 2);
  font-size: var(--font-size-base);
  line-height: var(--line-height-compact);
}
.hyt-card-body {
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-base);
}
.hyt-card-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--spacing) * 4.5);
  height: calc(var(--spacing) * 4.5);
  flex: none;
  border: 1px solid var(--v2-border-border-base);
  border-radius: 999px;
  color: var(--v2-system-accent);
}
.hyt-card[aria-pressed="true"] .hyt-card-mark {
  border-color: var(--v2-system-accent);
  background: var(--v2-system-accent);
  color: var(--v2-background-bg-base);
}

.hyt-onboarding {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 6);
  background: color-mix(in srgb, var(--v2-background-bg-base) 84%, transparent);
  backdrop-filter: blur(10px);
  font-family: var(--font-family-sans);
}
.hyt-onboarding-panel {
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: min(720px, calc(100vh - calc(var(--spacing) * 12)));
  overflow: hidden;
  border: 1px solid var(--v2-border-border-base);
  border-radius: var(--radius-popover);
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-overlay);
}
.hyt-onboarding-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
  padding: calc(var(--spacing) * 6) calc(var(--spacing) * 6) calc(var(--spacing) * 3);
}
.hyt-onboarding-eyebrow {
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-xx-small);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.hyt-onboarding-title {
  margin: calc(var(--spacing) * 1) 0 0;
  color: var(--v2-text-text-base);
  font-size: var(--font-size-x-large);
  font-weight: 600;
  line-height: var(--line-height-tight);
}
.hyt-onboarding-lede {
  margin: calc(var(--spacing) * 1.5) 0 0;
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-small);
  line-height: var(--line-height-base);
  max-width: 34rem;
}
.hyt-onboarding-steps {
  display: flex;
  gap: calc(var(--spacing) * 1.5);
  padding: 0 calc(var(--spacing) * 6);
}
.hyt-onboarding-step {
  height: calc(var(--spacing) * 0.75);
  flex: 1;
  border-radius: 999px;
  background: var(--v2-border-border-muted);
}
.hyt-onboarding-step[data-active="true"] { background: var(--v2-system-accent); }
.hyt-onboarding-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing) * 5) calc(var(--spacing) * 6);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
}
.hyt-onboarding-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 6);
  border-top: 1px solid var(--v2-border-border-muted);
  background: var(--v2-background-bg-layer-02);
}
.hyt-onboarding-foot-group {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
}
.hyt-onboarding-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--v2-text-text-faint);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-x-small);
  cursor: pointer;
}
.hyt-onboarding-link:hover { color: var(--v2-text-text-muted); }
.hyt-onboarding-link:focus-visible {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
.hyt-field {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
}
.hyt-field-label {
  color: var(--v2-text-text-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-compact);
}
.hyt-field-help {
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-compact);
}
.hyt-identity {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 4);
  border: 1px solid var(--v2-border-border-muted);
  border-radius: var(--radius-lg);
  background: var(--v2-background-bg-layer-02);
}
.hyt-identity-value {
  color: var(--v2-text-text-base);
  font-size: var(--font-size-base);
  line-height: var(--line-height-compact);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-identity-label {
  color: var(--v2-text-text-faint);
  font-size: var(--font-size-xx-small);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.hyt-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
}
.hyt-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border: 1px solid var(--v2-border-border-muted);
  border-radius: var(--radius-md);
  background: var(--v2-background-bg-layer-02);
}
.hyt-list-text {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
  min-width: 0;
}
.hyt-list-title {
  color: var(--v2-text-text-base);
  font-size: var(--font-size-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-list-detail {
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-x-small);
}
.hyt-trial {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 3);
  border: 1px solid var(--v2-border-border-muted);
  border-radius: var(--radius-md);
  background: var(--v2-background-bg-layer-02);
}
.hyt-trial-line {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: calc(var(--spacing) * 2);
  color: var(--v2-text-text-muted);
  font-size: var(--font-size-x-small);
  line-height: var(--line-height-compact);
}
.hyt-trial-sender {
  color: var(--v2-text-text-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hyt-preview {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  gap: calc(var(--spacing) * 2);
  font-size: var(--font-size-small);
  line-height: var(--line-height-base);
}
.hyt-preview-key { color: var(--v2-text-text-muted); }
.hyt-preview-value { color: var(--v2-text-text-base); }
`
