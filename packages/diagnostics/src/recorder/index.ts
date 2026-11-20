// The recorder registry. Order is the install order and the order of `capture.sources`; navigation is first so
// `session.start` is always the first event in a dump.

import { consoleRecorder } from "./console"
import { domRecorder } from "./dom"
import { errorsRecorder } from "./errors"
import { inputRecorder } from "./input"
import { layoutRecorder } from "./layout"
import { navigationRecorder } from "./navigation"
import { networkRecorder } from "./network"
import { performanceRecorder } from "./performance"

export const RECORDERS = [
  navigationRecorder,
  domRecorder,
  inputRecorder,
  errorsRecorder,
  consoleRecorder,
  networkRecorder,
  performanceRecorder,
  layoutRecorder,
]

export type { Recorder, RecorderContext } from "./types"
