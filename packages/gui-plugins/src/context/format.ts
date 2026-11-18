export function createSessionContextFormatter(locale: string) {
  // The fields luxon's DATETIME_MED preset passed to Intl; output is identical.
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  // A call's clock time, as the call ledger lists it.
  const timeOfDay = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return {
    number(value: number | null | undefined) {
      if (value === undefined) return "—"

      if (value === null) return "—"

      return value.toLocaleString(locale)
    },
    percent(value: number | null | undefined) {
      if (value === undefined) return "—"

      if (value === null) return "—"

      return value.toLocaleString(locale) + "%"
    },
    time(value: number | undefined) {
      if (!value) return "—"

      return dateTime.format(value)
    },
    clock(value: number | undefined) {
      if (!value) return "—"

      return timeOfDay.format(value)
    },
    /** Elapsed milliseconds as `2.4s`, or `1m 12s` past a minute. */
    duration(value: number | undefined) {
      if (value === undefined || value < 0) return "—"

      const seconds = value / 1000

      if (seconds < 60) return seconds.toFixed(1) + "s"

      const minutes = Math.floor(seconds / 60)

      return `${minutes}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`
    },
    /** Output tokens per second, rounded; the unit is supplied by the copy. */
    rate(value: number | undefined) {
      if (value === undefined || !Number.isFinite(value)) return "—"

      return Math.round(value).toLocaleString(locale)
    },
    /** Compact token counts for the window legend, e.g. `12.4k`. */
    compact(value: number | undefined) {
      if (value === undefined) return "—"

      return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
        .format(value)
        .toLocaleLowerCase(locale)
    },
  }
}
