// The console tap: `error` and `warn` are forwarded to the original implementation after being recorded.

import { short } from "./format"
import type { Recorder } from "./types"

const LEVELS = ["error", "warn"] as const

export const consoleRecorder: Recorder = {
  name: "console",
  start(ctx) {
    for (const level of LEVELS) {
      const original = console[level]
      console[level] = ((...args: unknown[]) => {
        ctx.observed()
        ctx.record(`console.${level}`, { args: args.map((arg) => short(arg)) })
        original.apply(console, args)
      }) as typeof console.error
    }
  },
}
