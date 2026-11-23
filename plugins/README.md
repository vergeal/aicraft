# Official plugins

Each directory is a separately installable OpenCode plugin. Plugins are currently installed from Git URLs, not npm. The URL can omit a branch name to use the repository's default branch.

These packages are not bundled with OpenCode or loaded automatically. Do not add them to Core's dependencies, its built-in plugin registry, or the repository's `.opencode/plugins/` directory.

| Plugin                       | Directory                 | Form         |
| ---------------------------- | ------------------------- | ------------ |
| [Webwright](webwright/README.md) | `plugins/webwright` | `.craf` |
| [DBRO](dbro/README.md)       | `plugins/dbro`   | `.craf` |
| [Orchestrator](orchestrator/README.md) | `plugins/orchestrator` | `.craf` |
| [Figma](figma/README.md)     | `plugins/figma`  | Git package  |
| [IT 工单](itsm/README.md)    | `plugins/itsm`   | `.craf`      |
