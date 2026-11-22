# hyt-native-bridge

虹云通（容信）原生桥接进程：把 EC SDK 的登录、收发、下载与本地 `chatmsg.db` 包装成
本地 TCP 上的换行分隔 JSON-RPC 2.0，供 Electron 客户端的插件调用。

与 GUI 客户端共用同一个 `~/Documents/CHFile` 数据目录和同一套 SDK 配置文件；
不修改、不接管 GUI 进程。

## 目录

```
native/
  CMakeLists.txt        三平台构建配置
  src/
    main.cpp            TCP 监听、RPC 路由、bridge.json、单实例锁
    sdk_host.cpp        EC SDK 生命周期、登录、收发、群成员、下载、事件
    store.cpp           chatmsg.db 读写（历史/会话/群/自己发出的消息）
    message.cpp         消息类型映射、统一载荷、合并转发解析
    util.cpp            日志、时间、路径、Base64、AES、MD5、HTTP、文件系统
    json.hpp            内部 JSON 值类型
  scripts/
    build-macos.sh      macOS 构建
    selftest.mjs        无登录的只读自测
  PROTOCOL.md           方法与事件完整定义
```

## 构建

### macOS

```bash
export HYT_SDK_ROOT=/path/to/sdk      # 含 include/mac 与 lib/mac
./scripts/build-macos.sh
# 产物：build/bin/hyt-native-bridge
```

`HYT_SDK_ROOT` 不设或库缺失时编译 stub：进程仍能启动并提供本地历史/会话，
`auth.login` 与收发方法返回明确的不可用原因，不会崩溃。

macOS 链接 `libECMacSDK.a` 与 `ECMediaSDK.framework`，另需系统自带 SQLite3 与 libcurl。

### Windows

```bat
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 ^
  -DHYT_SDK_ROOT="C:\path\to\sdk"
cmake --build build --config Release
```

SDK 目录布局：`include/win/`（头文件）与 `lib/win/`（`ECsdk.lib`、`ecmedia.lib`、`ECsdk.dll`）。
CMake 也兼容 `libSdk/` 下的库文件。运行时把 `ECsdk.dll`、`ecmedia.dll` 放到可执行文件同目录。
HTTP 走 WinHTTP，不依赖 libcurl；SQLite3 需自行提供（例如 vcpkg 的 `sqlite3`）。

### Linux

CMake 已按 `include/linux`、`lib/linux/libECsdk.so` 写好链接配置，但**当前不支持**：
完整 SDK 还依赖若干私有 `.so`，缺失时在运行时直接报“未链接 EC SDK”，进程正常启动、
本地历史可用。要启用需补齐 `libECsdk.so`、`ecmedia.so`、`ccpclient.so` 等运行库。

## 运行

```bash
build/bin/hyt-native-bridge [--port 37210] [--verbose]
```

- 端口优先级：`--port` > `HYT_BRIDGE_PORT` > `NEWHYT_BRIDGE_PORT` > 37210。
- 数据目录：`HYT_CH_ROOT`（默认 `~/Documents/CHFile`），与 GUI 客户端一致。
- 启动后把 `{host, port, pid, startedAt}` 写入 `<CHFile>/Config/bridge.json`；
  该文件存在且 pid 存活时拒绝二次启动（单实例）。
- 监听地址固定 `127.0.0.1`，只接受本机连接。
- 日志：`<CHFile>/Config/logs/bridge.log`，`--verbose` 打开 DEBUG 级别；stdout 不输出敏感字段。

启动顺序刻意把监听与 `bridge.json` 放在 EC SDK 初始化之前（初始化要数秒），
避免调用方等待发现文件超时。初始化完成后才开始 accept 循环。

## 自测

```bash
node scripts/selftest.mjs                # 拉起进程，跑只读 RPC
node scripts/selftest.mjs --no-spawn     # 连已在运行的实例
```

覆盖 `ping`、`bridge.info`、`auth.state`、`im.sessions`、`im.history`、`im.groups`、
以及最近会话中存在合并消息时的 `im.mergeContent`。不登录、不发消息，结束后恢复
`Config/bridge.json` 并结束自己拉起的进程。

## 与插件的协议

方法与事件名与 `plugins/hyt/src/bridge/protocol.ts` 对齐，见 [PROTOCOL.md](./PROTOCOL.md)。
入口方法是 `auth.login`（`{userName, password}`）、`im.sendMessage`、`im.sessions`；
消息与连接状态通过事件推送，事件载荷与 `event.onMessage` 统一结构一致。

## 平台状态

| 平台 | 构建 | 登录/收发 | 本地历史 | 说明 |
| --- | --- | --- | --- | --- |
| macOS | 已跑通 | 已实现，待用真实账号验收 | 已验证 | 与 GUI 同账号会互踢，验收时先关 GUI |
| Windows | CMake 已配好 | 未验证 | 未验证 | 需自备 SQLite3 与 SDK 运行库 |
| Linux | 配置参考 | 不可用（stub） | 可用 | 缺 `.so` 时运行时明确报错 |

## 已知限制

- 接收到的消息只通过事件推送，不写入 `chatmsg.db`，避免与 GUI 客户端双写；
  只有本进程成功发出的消息会入库。
- 同一账号不能同时被 GUI 与 bridge 登录 IM，后登录方会把前者踢下线。
- `auth.login` 未传 `appId/appToken` 时会自行请求 PBS 换取；PBS 不可达或无
  libcurl 时必须显式传入 `appId/appToken`。
- 未传 `envFile`/`sdkConfig` 时自动探测 `<CHFile>/Config` 下的
  `sdk_server_config*.xml` 与 `rxSettings*.ini`，探测结果可在 `auth.state` 里确认。
- 合并转发内容从本地 `txt` 解析（base64 JSON 数组），文件缺失时只能给出标题。
- 群成员查询依赖已连接状态，未登录时直接返回“未登录或未连接”。
