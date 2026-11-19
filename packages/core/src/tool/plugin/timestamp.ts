export * as Timestamp from "./timestamp.js"

const pad = (value: number) => `${value}`.padStart(2, "0")

/** Local wall-clock time as `yyyy-MM-dd HH:mm:ss`, the format delivery headers show. */
export const local = (millis: number) => {
  const date = new Date(millis)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
