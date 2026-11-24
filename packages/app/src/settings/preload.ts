/**
 * Settings is one lazy route chunk that also carries every settings page and its stylesheet. Entry points warm it
 * before the user commits to opening Settings, so the route mounts on the click instead of waiting for the download.
 * The dynamic import shares the module cache with the route's `lazy()`, so it cannot load the chunk twice.
 */
export function preloadSettings() {
  void import("./shell")
}
