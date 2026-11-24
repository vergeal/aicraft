import type { ElectronNative } from "../preload/types"

declare global {
  interface ImportMetaEnv {
    readonly AICRAFT_TEST_ONBOARDING: boolean
  }

  interface Window {
    electron: ElectronNative
    __AICRAFT__?: {
      deepLinks?: string[]
    }
  }
}
