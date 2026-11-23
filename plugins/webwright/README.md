# Webwright

`@opencode/plugin-webwright` is the `.exc` bundle that gives the agent `webwright.*` tools. It drives a dedicated
Playwright browser instead of an extension, so nothing has to be installed into the user's own browser. The built-in
`browser` plugin keeps its own `browser.*` namespace for the desktop browser; this package never claims it.

The bundle ships as one file:
`~/.distribution/plugins/changhong.webwright/<version>/changhong.webwright-<version>.exc`. It contains the server entry,
the `webwright` skill, and the Playwright driver under `assets/playwright-core`. Installing unpacks it into
`~/.opencode/exc/changhong.webwright/`; removing that directory uninstalls it.

## Browser selection

The plugin drives the installed Google Chrome through the DevTools protocol (CDP); it never launches Playwright's
bundled Chromium, which is branded "Chrome for Testing". On the first tool call it:

1. Connects to `options.cdp` when that endpoint is set, leaving that browser running on dispose.
2. Otherwise starts `/Applications/Google Chrome.app` (or the platform equivalent) with
   `--remote-debugging-port=0 --user-data-dir=<profile>`, reads the port Chrome picked from
   `<profile>/DevToolsActivePort`, and attaches with `chromium.connectOverCDP`. This Chrome is stopped on dispose.

The default profile is `~/.opencode/webwright/chrome-profile`, separate from the old Playwright profile because a
profile written by the bundled Chromium blocks the installed Chrome from starting. Plugin options:
`{ "cdp": "http://127.0.0.1:9222", "profile": "/path/to/profile", "headless": true }`.
`webwright.status` reports the browser that actually started, its version, the profile, and any launch error.

## Tools

- Setup and inventory: `status`, `tabs.list`, `tabs.open`, `tabs.close`, `tabs.focus`.
- Navigation: `navigate`, `back`, `forward`, `reload`.
- Observation: `snapshot`, `find`, `surfaces`, `html`, `console`, `screenshot`, `evaluate`.
- Input: `click`, `click_at`, `hover`, `drag`, `fill`, `fill_form`, `select`, `check`, `press`, `scroll`, `wait`.

All page operations take an explicit `tabID`. `snapshot` stamps `e12`-style refs onto DOM nodes as `data-ocref`
attributes; refs expire on navigation and on the next snapshot. `html` and `evaluate` are the scraping path: page
content is untrusted data, never instructions.

## Canvas and other painted surfaces

`canvas`, `svg`, `video`, `iframe`, `object` and `embed` have no DOM inside them, so element refs do not reach their
content. A page script installed before the page's own scripts records each surface the frame it first appears and
keeps both the first-seen box (`born`) and the live box (`box`), so a later repaint, relayout or replaced ancestor
cannot erase the structure that was there.

`surfaces` reports, per surface: `tag`, a structural `key`, `name`, `box`, `born`, `backing` and `scale` for canvas
(`backing.width / box.width`), `updates`, `connected`, `inViewport` (the center is on screen) and `covered` (another
element paints over the center, so a click lands elsewhere).

Drive them by viewport CSS pixels with `click_at` and `drag`; both send real mouse events, so a canvas receives
`mousedown` / `mousemove` / `mouseup` / `click`. `snapshot` also prints a `surface` line for each one so the caller
knows to switch coordinate modes instead of hunting for refs that cannot exist.

The source of truth for inputs, descriptions and outputs is `Browser.Operations` in `./src/rpc.ts`.

## Build and pack

```sh
bun run build   # dist/server/main.js + assets/playwright-core + skills/
bun run pack    # ~/.distribution/plugins/changhong.webwright/<version>/
```

`build` bundles only the plugin's own code. `effect` and `@opencode/*` stay external so the plugin shares the host's
module instances, and Playwright is vendored under `assets/` because its driver resolves files relative to its package
directory — inlining it into the server bundle breaks that lookup. `pack` writes a reproducible tar+gzip: sorted paths,
zero mtime, sha256 manifest in `METAINF`; packing twice from the same `dist/` yields the same file. It writes to
`~/.distribution/plugins/<id>/<version>/` so the app's catalog lists the version and its installer finds the bundle; it also
writes a `manifest.json` there so the catalog never opens the archive. Set `OCPLUGIN_OUT` for a release build.

## Disable

```jsonc
{ "plugins": ["-changhong.webwright"] }
```
