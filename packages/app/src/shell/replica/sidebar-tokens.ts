/** Shared navigation-column measurements, so every destination reads as one surface. */
export const SECTION = "mb-1 px-2 text-[13px] leading-5 font-medium text-[var(--color-text-secondary)]"

export const ROW =
  "flex h-[29px] w-full items-center gap-2 rounded-[var(--radius-row)] px-2 text-start text-[14px] leading-5 text-[var(--color-text-primary)]"

export const LIST = "flex flex-col gap-[2px]"

// The sidebar header reaches the window's top edge, so it takes the content topbar's height from one token and holds
// the traffic lights at its start. The start padding is set from CSS per platform, where the lights' room is known.
export const HEADER = "flex h-[var(--sidebar-header-height)] shrink-0 items-center gap-1 pe-2"

export const ICON_BUTTON =
  "flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-icon-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-icon-primary)]"

export const PRIMARY =
  "mx-2 flex h-[var(--sidebar-new-chat-height)] shrink-0 items-center gap-2 rounded-[var(--radius-row)] px-2 text-[14px] leading-5 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"

export const SEARCH =
  "mx-2 flex h-[29px] shrink-0 items-center gap-1.5 rounded-[var(--radius-row)] border border-[var(--color-divider)] bg-[var(--color-main)] px-2"

export const FILTER =
  "flex h-[26px] items-center rounded-[var(--radius-row)] px-2 text-[12px] leading-4 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] data-[selected]:bg-[var(--color-selected)] data-[selected]:text-[var(--color-text-primary)]"
