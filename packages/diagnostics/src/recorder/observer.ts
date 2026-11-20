// `PerformanceObserver` is not available in every renderer and not every entry type is supported even when it
// is, so registration is best effort. A missing observer costs samples, never a throw.

export function observe<T extends PerformanceEntry>(
  type: string,
  init: PerformanceObserverInit,
  handle: (entries: T[]) => void,
): void {
  if (typeof PerformanceObserver === "undefined") return
  if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return
  new PerformanceObserver((list) => handle(list.getEntries() as T[])).observe(init)
}
