# Official plugins

Each directory is a separately installable AI Craft plugin. Plugins are currently installed from Git URLs, not npm. The URL can omit a branch name to use the repository's default branch.

These packages are not loaded automatically from a checkout. Do not add them to Core's dependencies, its built-in plugin registry, or the repository's `.aicraft/plugins/` directory.

Production desktop builds do bundle them: `packages/desktop/script/distribution.ts` builds each `.aix` and copies it, together with every directory under `skills/`, into the app's resources. On first launch the desktop copies that tree into the user's `~/.distribution/`, where Explore lists it, and never overwrites a file that already exists.

| Plugin                       | Directory                 | Form         |
| ---------------------------- | ------------------------- | ------------ |
| [Webwright](webwright/README.md) | `plugins/webwright` | `.aix` |
| [DBRO](dbro/README.md)       | `plugins/dbro`   | `.aix` |
| [Orchestrator](orchestrator/README.md) | `plugins/orchestrator` | `.aix` |
| [IT 工单](itsm/README.md)    | `plugins/itsm`   | `.aix`      |
