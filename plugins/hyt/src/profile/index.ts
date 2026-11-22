export {
  AUTOPILOT_SCOPES,
  HytProfile,
  PRESET_NAMES,
  ROLES,
  SCENES,
  defaultProfile,
} from "./schema.js"
export type { AutopilotScope, HytRole, HytScene, PresetName } from "./schema.js"
export { PRESETS, applyPreset, presetOf, presetFull, presetOps, presetTasks } from "./presets.js"
export type { PresetDefinition } from "./presets.js"
export { applyConfiguration, mergeProfile, resolveProfile } from "./merge.js"
export type { ProfilePatch, ResolveProfileInput } from "./merge.js"
export { isOnboarded, loadProfile, profilePath, saveProfile } from "./store.js"
