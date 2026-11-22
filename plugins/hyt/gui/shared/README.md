# 设置页与引导的界面层

`gui/settings/index.tsx` 与 `gui/onboarding/index.tsx` 是两个入口，共享本目录的契约、主进程数据层与样式。

## 模块

| 文件 | 职责 |
| --- | --- |
| `contract.ts` | `Ipc.define` 的 state 与方法；窗口与主进程共用的唯一契约 |
| `main.ts` | `provideHytIpc(ctx, options?)`：主进程侧唯一读盘入口，供 `Plugin.define({ main })` 调用 |
| `data.ts` | 档案、login.db、通讯录、聊天库、知识库、风格与 bridge 的 Node 实现 |
| `i18n.ts` | 中文词典与 `text(ctx, key)`；宿主没有 catalog 时回落到这里 |
| `styles.ts` | 插件自己画的状态点、卡片与全屏引导层 CSS |
| `components.tsx` | `useHyt(ctx)` 与几个共用小组件 |

## 数据目录

主进程按下面的顺序确定数据根目录：

1. `provideHytIpc(ctx, { dataDir })` 传入的路径（宿主若提供 plugin data 路径，从这里传）；
2. 否则推导 `~/.opencode/plugin-data/changhong.hyt`，与服务端 `ctx.paths.data` 的规则一致。

档案、知识库与风格都放在这个目录的 `hyt/` 下：

```text
<dataDir>/hyt/profile.json
<dataDir>/hyt/knowledge/index.json
<dataDir>/hyt/style/<account>.json
```

`gui/main.tsx` 接入时：

```ts
import { catalog } from "./shared/i18n"
import { provideHytIpc } from "./shared/main"
import { registerSettings } from "./settings"
import { registerOnboarding } from "./onboarding"

const setup: Plugin.Setup = (ctx) => {
  registerSettings(ctx)
  registerOnboarding(ctx)
}

export default Plugin.define({
  i18n: catalog,
  setup,
  main(ctx) {
    provideHytIpc(ctx)
  },
})
```

## 主进程与窗口的分工

- 窗口不读盘。`state` 里有档案、账号、部门、bridge、知识库计数与风格摘要，主进程写完后 `changed()` 推送。
- 方法：`patch`、`refresh`、`setLocation`、`selectAccount`、`bridge`、`people`、`restyle`、`clearLearning`、`trial`。
- Ipc 在网页里没有主进程，调用会 reject；`useHyt` 把错误显示成提示，页面保持可用。
- `bridgePath` 与数据根目录不在 `HytProfile` 里，存在主进程的 `ctx.storage.store("gui")`，通过 `setLocation` 写。

## 已知限制

- `HytProfile.scenes` 只有 6 个场景，引导按 6 张卡渲染，无法凑到 8 张而不改 `src/profile/schema.ts`。
- bridge 的生命周期在本目录重写了一份精简实现（`net` + `setTimeout`）。`src/bridge/supervisor.ts` 依赖 `Bun.sleep`，在 Electron 主进程不可用。
- 全屏引导挂在 `window.bottom` 槽位上，用 `position: fixed` 覆盖整窗；它不改路由，也不阻塞聊天页。
- `gui/main.tsx` 目前仍是占位，两个 `register*` 与 `provideHytIpc` 尚未接线，因此界面暂时不会出现在客户端里；接线代码见上一节。
