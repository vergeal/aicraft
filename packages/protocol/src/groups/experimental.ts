import { ArtifactEndpoints } from "./artifact.js"
import { DiagnosticsEndpoints } from "./diagnostics.js"
import { JobEndpoints } from "./job.js"
import { MediaGetEndpoint } from "./media.js"
import { PersistentPtyGroup } from "./persistent-pty.js"
import { ScheduleEndpoints } from "./schedule.js"
import { SearchEndpoints } from "./search.js"

/** `server.experimental`: routes under /api/experimental, without compatibility guarantees. */
export const ExperimentalGroup = PersistentPtyGroup.add(
  MediaGetEndpoint,
  ...ScheduleEndpoints,
  ...SearchEndpoints,
  ...ArtifactEndpoints,
  ...JobEndpoints,
  ...DiagnosticsEndpoints,
)
