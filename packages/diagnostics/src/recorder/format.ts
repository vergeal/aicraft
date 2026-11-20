// Formatting shared by every recorder: bounded strings and one-decimal numbers.

export const TEXT_LIMIT = 80

const PRECISION = 10

export const round = (value: number) => Math.round(value * PRECISION) / PRECISION

export const truncate = (value: string | null | undefined, limit = TEXT_LIMIT) => {
  if (!value) return ""
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

/** A bounded string for console/error payloads; objects may contain cycles. */
export function short(value: unknown): string {
  if (value instanceof Error) return truncate(`${value.name}: ${value.message}\n${value.stack ?? ""}`, 800)
  if (typeof value === "string") return truncate(value, 800)

  try {
    const encoded = JSON.stringify(value)
    return truncate(encoded === undefined ? String(value) : encoded, 800)
  } catch {
    return truncate(String(value), 800)
  }
}
