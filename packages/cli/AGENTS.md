# CLI development guide

- 本仓库的产品主线是 Electron 桌面客户端；CLI 只承担启动后端与本地服务，不要在这里扩展交互界面。
- Use `@opencode/client` and the location-scoped data in `packages/tui/src/context/data.tsx`.
- The TUI in `packages/tui` is kept for upstream parity only; do not add features, experiments or stories there.
