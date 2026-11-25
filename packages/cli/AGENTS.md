# CLI development guide

- The product of this repository is the Electron desktop client; the CLI only starts the backend and local services. Do not grow interactive UI here.
- Use `@aicraft/client` and the location-scoped data in `packages/tui/src/context/data.tsx`.
- The TUI in `packages/tui` is kept for upstream parity only; do not add features, experiments or stories there.
