# hyt-native-bridge 协议

## 传输

- TCP，监听 `127.0.0.1`，默认端口 37210；实际端口见 `<CHFile>/Config/bridge.json`。
- 每条消息是一行 JSON（`\n` 分隔），遵循 JSON-RPC 2.0：
  - 请求：`{"jsonrpc":"2.0","id":1,"method":"...","params":{...}}`
  - 响应：`{"jsonrpc":"2.0","id":1,"result":{...}}` 或 `{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"..."}}`
  - 事件：`{"jsonrpc":"2.0","method":"event.xxx","params":{...}}`（无 `id`）
- 只有未知方法返回 JSON-RPC `error`；业务失败放在 `result.ok=false` 与 `result.error` 里。
- 一个连接断开不影响进程，其他连接照常；进程重启后 `bridge.json` 的 `pid`/`startedAt` 变化。

`bridge.json`：

```json
{ "host": "127.0.0.1", "port": 37210, "pid": 12345, "startedAt": 1795277634539 }
```

## 方法

### ping

无参数。`{"pong":true,"ts":1795277634539}`。

### bridge.info

```json
{
  "name": "hyt-native-bridge",
  "version": "0.3.0",
  "runtime": "native/ecsdk",
  "platform": "darwin",
  "pid": 12345,
  "startedAt": 1795277634539,
  "uptimeMs": 1200,
  "chRoot": "/Users/me/Documents/CHFile",
  "store": "/Users/me/Documents/CHFile/csT1002173/chatmsg.db",
  "available": true,
  "loggedIn": false,
  "connected": false,
  "account": ""
}
```

`store` 为空串表示还没打开本地库；`available=false` 表示未链接 EC SDK（stub）。

### bridge.setEnv

设置后续 `auth.login` 的默认环境参数，字段都可省略。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `env` | string | `prod`（默认）或 `test` |
| `envFile` | string | `rxSettings*.ini` 路径 |
| `sdkConfig` | string | `sdk_server_config*.xml` 路径 |
| `pbsBase` | string | 覆盖 PBS 基地址，如 `https://chim.changhong.com:7773` |
| `comId` | string | 企业 ID |

返回 `{ok:true, env, envFile, sdkConfig, pbsBase}`。

### auth.login

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `userName` / `account` | string | 账号（不带 `cs` 前缀） |
| `password` | string | 明文密码 |
| `appId` | string | 可省略；省略时自行请求 PBS 换取 |
| `appToken` | string | 同上 |
| `comId` | string | 可省略 |
| `env` / `envFile` / `sdkConfig` / `pbsBase` | string | 可省略，覆盖 `setEnv` |
| `mode` | number | `LoginEx2` 模式，默认 `1`（用户输入），`2` 为自动登录 |
| `waitMs` | number | 等待连接状态的时间，默认 5000 |

返回：

```json
{ "ok": true, "pending": false, "account": "T1002173",
  "message": "", "ret": 0, "connectCode": 0, "reason": 0, "storeError": "" }
```

- `pending=true`：SDK 已接受登录但 `waitMs` 内未连上，后续看 `event.onConnectState`。
- `ok=false`：`message` 给出原因（缺少账号、PBS 失败、SDK 不可用等）。
- 登录成功后自动打开该账号的 `chatmsg.db`。

### auth.logout

`{ok:true, error:""}`。未登录时也返回 `ok=true`；stub 下返回 `ok=false` 与原因。

### auth.state

```json
{ "available": true, "loggedIn": true, "connected": true, "account": "T1002173",
  "comId": "1", "env": "prod",
  "envFile": "/Users/me/Documents/CHFile/Config/rxSettings_wai.ini",
  "sdkConfig": "/Users/me/Documents/CHFile/Config/sdk_server_config_wai.xml",
  "connectCode": 0, "connectReason": 0, "reason": "" }
```

`connectCode`：0 成功，1 连接中，2 失败，3 被踢，4 强制下线；`-1` 未连接。

### im.sessions

参数 `{limit?: number}`，默认 50，上限 500。按本地 `lastmsg` 表取会话：

```json
{ "sessions": [ { "...消息载荷": "...", "unread": 3, "groupName": "项目群",
                  "title": "项目群", "type": 1, "lastAt": 1795277634539 } ] }
```

每项就是下面「消息载荷」的同结构，另外带 `unread`、`title`（群名或对方昵称）、
`type`（0 单聊 / 1 群聊）、`lastAt`（最后一条消息时间），群会话还有 `groupName`。
本地库未打开时返回 `{sessions:[], error:"本地 chatmsg.db 未打开"}`。

### im.groups

`{groups:[{groupId, name, avatar?}]}`。本地 `keepgroup` 表与 SDK 拉取的群列表合并去重。

### im.members

参数 `{groupId, waitMs?: number}`（默认 5000）。

```json
{ "ok": true, "members": [{"account":"T1000735","name":"张三","role":1,"sex":1}], "error": "" }
```

未登录或未连接时 `ok=false`、`members=[]`、`error="未登录或未连接"`。

### im.markRead

参数 `{msgId, group?: boolean, waitMs?: number}`（默认 3000）。把「我已经读过这条」上报给服务端：
群聊走 `ReadMessageGroup`，单聊走 `ReadMessage`。别人看到的「N 人已读」里就有这一次。

```json
{ "ok": true, "msgId": "...", "error": "" }
```

上报失败时 `ok=false`、`error` 说明原因。这个接口只上报当前账号自己的已读，不改任何人的人员名单。

### im.recall

参数 `{msgId, waitMs?: number}`（默认 5000）。撤回自己发出的一条消息（`WithDrawMessage`）。
可撤回的时间窗由服务端判定：桥接不做本地时限检查，超窗等拒绝原因原样进 `error`。

```json
{ "ok": true, "msgId": "...", "error": "" }
```

成功后服务端会向会话广播一条撤回通知消息（MsgType 25），本地库随消息推送自然更新。

### im.history

参数 `{sessionId, beforeId?, limit?}`（默认 30，上限 200）。按 `Id` 倒序分页，
`beforeId` 传上一页最旧一条的 `id` 取更早的消息。

```json
{ "messages": [ { "...消息载荷": "..." } ], "hasMore": true }
```

### im.sendMessage

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `sessionId` | string | 单聊为对方账号，群聊为群 ID |
| `text` | string | 文本内容 |
| `userData` | string | 可省略；群 @ 需要时传 `{"at":[{"account","name"}]}` |
| `extOpts` | string | 可省略；传 `{"at":["account"],"comId":"1"}` |
| `at` | array | 可省略；元素为账号字符串或 `{account,name}`，自动生成上面两项 |

返回 `{ok, msgId, ret, error}`。`ret` 是 SDK 返回码，0 为成功。发送结果同时以
`event.onSendResult` 推送；成功后写 `chatmsg.db` 并广播 `event.onMessage`。

### im.sendMedia

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `sessionId` | string | 同上 |
| `filePath` | string | 本地文件绝对路径 |
| `fileName` | string | 可省略，展示名 |
| `msgType` | number | 可省略，按扩展名推断：图片 4、音频 2、视频 3、其他 6 |
| `rotate` | number | 图片旋转角度，默认 0 |
| `userData` / `extOpts` | string | 同上 |

返回同 `im.sendMessage`。上传进度以 `event.onUploadProgress` 推送。

### im.download

参数 `{msgId, waitMs?}`（默认 5000）。消息必须是本地库里的记录（`msgId` 或
`id` 都可）。下载到 `<CHFile>/<account>/RecvFiles/YYYYMM/`，重名自动加后缀。

```json
{ "ok": true, "pending": false, "msgId": "...", "path": "/Users/.../file.pdf", "error": "" }
```

成功后把路径写回 `chatmsg.db` 的 `FileFullPath`；同时推送 `event.onDownload`。

### im.mergeContent

参数二选一：`{msgId}` 从本地库定位合并消息，或 `{content}` 直接给 txt/base64 内容。

```json
{ "ok": true, "title": "张三和李四的消息记录",
  "entries": [ { "type": 1, "kind": "text", "account": "T1002173", "msgId": "...",
                 "time": 1795277634, "text": "内容", "userData": "",
                 "file": {"name":"a.pdf","size":1024,"url":"","localPath":"","ext":"pdf"} } ] }
```

`file` 只在该条是文件类消息时出现。

## 事件

事件帧：`{"jsonrpc":"2.0","method":"event.xxx","params":...}`。

| 事件 | params |
| --- | --- |
| `event.onMessage` | 消息载荷（见下） |
| `event.onSendResult` | `{ok, kind, msgId, matchKey, ret}` |
| `event.onConnectState` | `{connected, code, reason, account}` |
| `event.onKicked` | 同 `onConnectState`，被踢或强制下线时额外推送 |
| `event.onGroups` | `[{groupId, name}]`（数组） |
| `event.onGroupNotice` | `{notice, msgId}`，`notice` 为 SDK 通知类型 |
| `event.onReadReceipt` | `{msgId, sessionId, account, nick, at, voice, targetId, content, userData, relate}` |
| `event.onOfflineMessage` | `{msgId, sessionId}`，离线消息同步时逐条推送 |
| `event.onOffline` | `{count, complete:false}` 或 `{complete:true}` |
| `event.onUploadProgress` | `{matchKey, uploaded, total}` |
| `event.onDownload` | `{ok, msgId, path, ret}` |
| `event.onStoreError` | `{msgId, error}`，写/更新 `chatmsg.db` 失败 |

`event.onReadReceipt` 是别人读了你发的消息后服务端推回来的通知：`msgId` 是通知自身 id，
`account` 是**读的人**（`nick` 是对应昵称），`targetId` 才是被读消息 id。SDK 不同版本可能把它
放在 `targetId`、`content` 或 `relate[0]` 里，插件侧按这个顺序归一。`voice` 区分语音消息已读。

这是推送流，桥接层不落库；离线期间没收到就补不回来，所以界面拿不到时显示「已读信息暂不可用」，
而不是先报 0 人。

## 消息载荷

`event.onMessage`、`im.history`、`im.sessions` 使用同一结构：

```json
{
  "id": "1795146745802",
  "msgId": "1795146745802|95360",
  "kind": "text",
  "text": "在吗",
  "sessionId": "T1000735",
  "chatType": 0,
  "createdAt": 1795146745802,
  "localTime": 0,
  "sender": {"account": "T1000735", "name": "张三"},
  "isAt": false,
  "at": [],
  "file": {"name": "a.pdf", "size": 1024, "url": "202611/xxx.pdf", "localPath": "", "ext": "pdf"},
  "merge": {"title": "聊天记录"},
  "raw": {"msgType": 1, "userData": ""}
}
```

- `chatType`：0 单聊，1 群聊。
- `file` 仅文件/图片/音视频类消息出现；`url` 是相对路径（下载时补服务器前缀）。
- `merge` 仅 `kind=merge` 出现。
- `raw.userData` 是原始 `userData`（文件类消息为 base64 JSON 时会先解码）。

`kind` 与 `msgType` 的映射：

| msgType | kind |
| --- | --- |
| 1、11 | `text` |
| 2 | `voice` |
| 3 | `video` |
| 4 | `image` |
| 6、7 | `file` |
| 25 | `recall` |
| 101 | `call` |
| 150、246 | `notice` |
| 245 | `merge` |
| 其他 | `other` |

## 登录链路

`auth.login` 依次：

1. 传入 `appId`/`appToken` 则直接使用；
2. 否则请求 PBS `POST <pbsBase>/common/login/thirdLogin`，body 字段与 GUI 客户端一致
   （`loginName` 不带 `cs`、`userpasswd` 为 MD5、`aesPwd` 为 AES-128-CBC/PKCS7 + Base64，
   key `yuntongxun123456`，IV 为 ASCII `0000000000000000`）；
3. 成功响应 `head.statusCode == "000000"`，从 `body` 取 `appid`/`apptoken`/`companyid`/`account`；
4. `SetServerEnvType(1, sdkConfig)` 后调用 `LoginEx2`，`waitMs` 内等到连接成功或超时。
