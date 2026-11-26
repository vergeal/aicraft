// 虹云通（容信）原生桥接进程。
//
// 本地 TCP + 换行分隔 JSON-RPC 2.0；EC SDK 负责登录、收发与下载，
// chatmsg.db 负责本地历史/会话。协议见 PROTOCOL.md。
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <process.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif
typedef SOCKET hyt_socket;
#else
#include <arpa/inet.h>
#include <dirent.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>
typedef int hyt_socket;
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif
#endif

#include "json.hpp"
#include "message.hpp"
#include "sdk_host.hpp"
#include "store.hpp"
#include "util.hpp"

namespace {

using nhjson::Value;

const char* kBridgeVersion = "0.3.0";

std::mutex gClientsMutex;
std::vector<hyt_socket> gClients;
std::atomic<int> gClientSeq{0};

std::mutex gStoreMutex;
std::shared_ptr<hyt::Store> gStore;

std::mutex gSettingsMutex;
hyt::LoginOptions gLoginTemplate;

bool gVerbose = false;
long long gStartedAt = 0;

#ifdef _WIN32
// 进程存活期间一直持有；进程退出时由系统释放，不能提前关闭，否则会失去单实例保证。
HANDLE gInstanceMutex = nullptr;
#endif

long long pidValue() {
#ifdef _WIN32
  return (long long)_getpid();
#else
  return (long long)getpid();
#endif
}

bool processAlive(long long pid) {
  if (pid <= 0) return false;
#ifdef _WIN32
  HANDLE handle = OpenProcess(SYNCHRONIZE, FALSE, (DWORD)pid);
  if (!handle) return false;
  DWORD result = WaitForSingleObject(handle, 0);
  CloseHandle(handle);
  return result == WAIT_TIMEOUT;
#else
  return kill((pid_t)pid, 0) == 0;
#endif
}

void netClose(hyt_socket fd) {
#ifdef _WIN32
  closesocket(fd);
#else
  close(fd);
#endif
}

void netSend(hyt_socket fd, const std::string& data) {
  size_t off = 0;
  while (off < data.size()) {
#ifdef _WIN32
    int n = send(fd, data.data() + off, (int)(data.size() - off), MSG_NOSIGNAL);
#else
    ssize_t n = send(fd, data.data() + off, data.size() - off, MSG_NOSIGNAL);
#endif
    if (n <= 0) return;
    off += (size_t)n;
  }
}

Value notification(const std::string& method, const Value& params) {
  Value v = Value::object();
  v.set("jsonrpc", Value::string("2.0"));
  v.set("method", Value::string(method));
  v.set("params", params);
  return v;
}

void broadcast(const std::string& method, const Value& params) {
  std::string line = notification(method, params).dump();
  line.push_back('\n');
  std::lock_guard<std::mutex> lk(gClientsMutex);
  for (hyt_socket fd : gClients) netSend(fd, line);
}

void respond(hyt_socket fd, const Value& id, const Value& result) {
  Value v = Value::object();
  v.set("jsonrpc", Value::string("2.0"));
  v.set("id", id);
  v.set("result", result);
  std::string line = v.dump();
  line.push_back('\n');
  netSend(fd, line);
}

void respondError(hyt_socket fd, const Value& id, int code, const std::string& message) {
  Value err = Value::object();
  err.set("code", Value::number(code));
  err.set("message", Value::string(message));
  Value v = Value::object();
  v.set("jsonrpc", Value::string("2.0"));
  v.set("id", id);
  v.set("error", err);
  std::string line = v.dump();
  line.push_back('\n');
  netSend(fd, line);
}

std::string paramString(const Value& params, const std::string& key,
                        const std::string& fallback = "") {
  std::string value = params.getString(key, fallback);
  return value;
}

int paramInt(const Value& params, const std::string& key, int fallback) {
  const Value* v = params.find(key);
  if (!v) return fallback;
  if (v->type == Value::NUM) return (int)v->num;
  if (v->type == Value::STR) return atoi(v->str.c_str());
  return fallback;
}

std::shared_ptr<hyt::Store> storeIfOpen() {
  std::lock_guard<std::mutex> lk(gStoreMutex);
  if (!gStore || !gStore->available()) return nullptr;
  return gStore;
}

bool ensureStore(const std::string& account, std::string* error) {
  std::lock_guard<std::mutex> lk(gStoreMutex);
  auto store = std::make_shared<hyt::Store>(account);
  if (!store->open()) {
    if (error) *error = store->error();
    return false;
  }
  gStore = store;
  return true;
}

// SDK 不可用时仍需读本地历史：挑最近改动过的账号库。
bool openNewestStore() {
  std::string root = hyt::chRootDir();
  std::string best;
  long long bestTime = -1;
#ifdef _WIN32
  WIN32_FIND_DATAA data;
  HANDLE handle = FindFirstFileA((root + "\\*").c_str(), &data);
  if (handle != INVALID_HANDLE_VALUE) {
    do {
      if (!(data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
      std::string name = data.cFileName;
      if (name == "." || name == "..") continue;
      std::string db = hyt::joinPath(hyt::joinPath(root, name), "chatmsg.db");
      if (!hyt::fileExists(db)) continue;
      long long stamp = ((long long)data.ftLastWriteTime.dwHighDateTime << 32) |
                        data.ftLastWriteTime.dwLowDateTime;
      if (stamp > bestTime) {
        bestTime = stamp;
        best = name;
      }
    } while (FindNextFileA(handle, &data));
    FindClose(handle);
  }
#else
  DIR* dir = opendir(root.c_str());
  if (dir) {
    while (dirent* entry = readdir(dir)) {
      std::string name = entry->d_name;
      if (name == "." || name == "..") continue;
      std::string db = hyt::joinPath(hyt::joinPath(root, name), "chatmsg.db");
      struct stat st;
      if (stat(db.c_str(), &st) != 0) continue;
      if (st.st_mtime > bestTime) {
        bestTime = st.st_mtime;
        best = name;
      }
    }
    closedir(dir);
  }
#endif
  if (best.empty()) return false;
  std::string error;
  bool ok = ensureStore(best, &error);
  if (ok) {
    hyt::logInfo("已打开最近使用的本地库: %s", hyt::dbPath(best).c_str());
  } else {
    hyt::logError("打开最近使用的本地库失败: %s", error.c_str());
  }
  return ok;
}

// 群 @：extOpts 传账号数组，userData 传账号+昵称。
std::string buildAtUserData(const Value& at) {
  Value arr = Value::array();
  for (const auto& item : at.arr) {
    Value entry = Value::object();
    if (item.type == Value::STR) {
      entry.set("account", Value::string(item.str));
    } else {
      entry.set("account", Value::string(item.getString("account")));
      entry.set("name", Value::string(item.getString("name")));
    }
    arr.arr.push_back(entry);
  }
  Value root = Value::object();
  root.set("at", arr);
  return root.dump();
}

std::string buildAtExtOpts(const Value& at, const std::string& comId) {
  Value arr = Value::array();
  for (const auto& item : at.arr) {
    std::string account =
        item.type == Value::STR ? item.str : item.getString("account");
    if (!account.empty()) arr.arr.push_back(Value::string(account));
  }
  Value root = Value::object();
  root.set("at", arr);
  root.set("comId", Value::string(comId));
  return root.dump();
}

int inferMsgType(const std::string& path) {
  std::string name = hyt::toLower(path);
  auto ends = [&name](const std::string& suffix) {
    return name.size() >= suffix.size() &&
           name.compare(name.size() - suffix.size(), suffix.size(), suffix) == 0;
  };
  if (ends(".jpg") || ends(".jpeg") || ends(".png") || ends(".gif") ||
      ends(".bmp") || ends(".webp")) {
    return 4;
  }
  if (ends(".mp3") || ends(".wav") || ends(".amr") || ends(".aac") ||
      ends(".silk")) {
    return 2;
  }
  if (ends(".mp4") || ends(".mov") || ends(".avi") || ends(".mkv") ||
      ends(".m4v")) {
    return 3;
  }
  return 6;
}

Value rpcInfo() {
  auto& sdk = hyt::SdkHost::instance();
  Value v = Value::object();
  v.set("name", Value::string("hyt-native-bridge"));
  v.set("version", Value::string(kBridgeVersion));
  v.set("runtime", Value::string("native/ecsdk"));
#ifdef _WIN32
  v.set("platform", Value::string("win32"));
#elif defined(__APPLE__)
  v.set("platform", Value::string("darwin"));
#else
  v.set("platform", Value::string("linux"));
#endif
  v.set("pid", Value::number((double)pidValue()));
  v.set("startedAt", Value::number((double)gStartedAt));
  v.set("uptimeMs", Value::number((double)(hyt::nowMs() - gStartedAt)));
  v.set("chRoot", Value::string(hyt::chRootDir()));
  if (auto store = storeIfOpen()) {
    v.set("store", Value::string(store->file()));
  } else {
    v.set("store", Value::string(""));
  }
  v.set("available", Value::boolean(sdk.available()));
  v.set("loggedIn", Value::boolean(sdk.loggedIn()));
  v.set("connected", Value::boolean(sdk.connected()));
  v.set("account", Value::string(sdk.account()));
  return v;
}

Value rpcAuthState() {
  auto& sdk = hyt::SdkHost::instance();
  Value v = Value::object();
  v.set("available", Value::boolean(sdk.available()));
  v.set("loggedIn", Value::boolean(sdk.loggedIn()));
  v.set("connected", Value::boolean(sdk.connected()));
  v.set("account", Value::string(sdk.account()));
  v.set("comId", Value::string(sdk.comId()));
  v.set("env", Value::string(sdk.envName()));
  v.set("envFile", Value::string(sdk.envFile()));
  v.set("sdkConfig", Value::string(sdk.sdkConfig()));
  v.set("connectCode", Value::number(sdk.connectCode()));
  v.set("connectReason", Value::number(sdk.connectReason()));
  v.set("reason", Value::string(sdk.unavailableReason()));
  return v;
}

Value rpcAuthLogin(const Value& params) {
  hyt::LoginOptions options;
  {
    std::lock_guard<std::mutex> lk(gSettingsMutex);
    options = gLoginTemplate;
  }
  if (params.has("userName")) options.userName = paramString(params, "userName");
  if (params.has("account")) options.userName = paramString(params, "account");
  if (params.has("password")) options.password = paramString(params, "password");
  if (params.has("appId")) options.appId = paramString(params, "appId");
  if (params.has("appToken")) options.appToken = paramString(params, "appToken");
  if (params.has("comId")) options.comId = paramString(params, "comId");
  if (params.has("env")) options.env = paramString(params, "env");
  if (params.has("envFile")) options.envFile = paramString(params, "envFile");
  if (params.has("sdkConfig")) options.sdkConfig = paramString(params, "sdkConfig");
  if (params.has("pbsBase")) options.pbsBase = paramString(params, "pbsBase");
  if (params.has("mode")) options.mode = paramInt(params, "mode", 1);
  if (params.has("waitMs")) options.waitMs = paramInt(params, "waitMs", 5000);

  hyt::LoginResult result = hyt::SdkHost::instance().login(options);

  std::string storeError;
  if (!result.account.empty() && ensureStore(result.account, &storeError)) {
    hyt::logInfo("已打开本地库: %s", hyt::dbPath(result.account).c_str());
  } else if (!storeError.empty()) {
    hyt::logError("打开本地库失败: %s", storeError.c_str());
  }

  Value v = Value::object();
  v.set("ok", Value::boolean(result.ok));
  v.set("pending", Value::boolean(result.pending));
  v.set("account", Value::string(result.account));
  v.set("message", Value::string(result.message));
  v.set("ret", Value::number(result.ret));
  v.set("connectCode", Value::number(result.connectCode));
  v.set("reason", Value::number(result.reason));
  v.set("storeError", Value::string(storeError));
  return v;
}

Value rpcAuthLogout() {
  std::string error;
  bool ok = hyt::SdkHost::instance().logout(&error);
  Value v = Value::object();
  v.set("ok", Value::boolean(ok));
  v.set("error", Value::string(error));
  return v;
}

Value rpcSessions(const Value& params) {
  int limit = paramInt(params, "limit", 50);
  if (limit <= 0 || limit > 500) limit = 50;
  Value v = Value::object();
  Value list = Value::array();
  auto store = storeIfOpen();
  if (!store) {
    v.set("sessions", list);
    v.set("error", Value::string("本地 chatmsg.db 未打开"));
    return v;
  }
  for (const auto& row : store->sessions(limit)) {
    Value item = hyt::messageToJson(row.last);
    item.set("unread", Value::number((double)row.unread));
    if (!row.groupName.empty()) item.set("groupName", Value::string(row.groupName));
    item.set("title", Value::string(row.groupName.empty() ? row.last.senderNick : row.groupName));
    item.set("type", Value::number(row.last.sessionType));
    item.set("lastAt", Value::number(item.getNumber("createdAt", 0)));
    list.arr.push_back(item);
  }
  v.set("sessions", list);
  return v;
}

Value rpcGroups() {
  Value v = Value::object();
  Value list = Value::array();
  std::vector<std::pair<std::string, std::string>> seen;
  auto store = storeIfOpen();
  if (store) {
    for (const auto& row : store->groups()) {
      Value item = Value::object();
      item.set("groupId", Value::string(row.groupId));
      item.set("name", Value::string(row.name));
      if (!row.avatar.empty()) item.set("avatar", Value::string(row.avatar));
      list.arr.push_back(item);
      seen.emplace_back(row.groupId, row.name);
    }
  }
  for (const auto& group : hyt::SdkHost::instance().groups()) {
    bool exists = false;
    for (const auto& item : seen) {
      if (item.first == group.first) {
        exists = true;
        break;
      }
    }
    if (exists) continue;
    Value item = Value::object();
    item.set("groupId", Value::string(group.first));
    item.set("name", Value::string(group.second));
    list.arr.push_back(item);
  }
  v.set("groups", list);
  return v;
}

Value rpcMembers(const Value& params) {
  std::string groupId = paramString(params, "groupId");
  int waitMs = paramInt(params, "waitMs", 5000);
  Value v = Value::object();
  if (groupId.empty()) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string("缺少 groupId"));
    return v;
  }
  hyt::MemberResult result = hyt::SdkHost::instance().queryMembers(groupId, waitMs);
  Value list = Value::array();
  for (const auto& member : result.members) {
    Value item = Value::object();
    item.set("account", Value::string(member.account));
    item.set("name", Value::string(member.name));
    item.set("role", Value::number(member.role));
    item.set("sex", Value::number(member.sex));
    list.arr.push_back(item);
  }
  v.set("ok", Value::boolean(result.ok));
  v.set("members", list);
  v.set("error", Value::string(result.error));
  return v;
}

Value rpcMarkRead(const Value& params) {
  std::string msgId = paramString(params, "msgId");
  bool group = params.getBool("group", false);
  int waitMs = paramInt(params, "waitMs", 3000);
  Value v = Value::object();
  if (msgId.empty()) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string("缺少 msgId"));
    return v;
  }
  hyt::ReadResult result = hyt::SdkHost::instance().markRead(msgId, group, waitMs);
  v.set("ok", Value::boolean(result.ok));
  v.set("msgId", Value::string(result.msgId));
  v.set("error", Value::string(result.error));
  return v;
}

Value rpcRecallMessage(const Value& params) {
  std::string msgId = paramString(params, "msgId");
  int waitMs = paramInt(params, "waitMs", 5000);
  Value v = Value::object();
  if (msgId.empty()) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string("缺少 msgId"));
    return v;
  }
  // 撤回时间窗交给服务端判定：超窗等原因都在 reason 里，桥接不本地拦。
  hyt::RecallResult result = hyt::SdkHost::instance().recallMessage(msgId, waitMs);
  v.set("ok", Value::boolean(result.ok));
  v.set("msgId", Value::string(result.msgId));
  v.set("error", Value::string(result.error));
  return v;
}

Value rpcHistory(const Value& params) {
  std::string sessionId = paramString(params, "sessionId");
  std::string beforeId = paramString(params, "beforeId");
  int limit = paramInt(params, "limit", 30);
  if (limit <= 0 || limit > 200) limit = 30;
  Value v = Value::object();
  Value list = Value::array();
  auto store = storeIfOpen();
  if (!store) {
    v.set("messages", list);
    v.set("hasMore", Value::boolean(false));
    v.set("error", Value::string("本地 chatmsg.db 未打开"));
    return v;
  }
  bool hasMore = false;
  for (const auto& row : store->history(sessionId, beforeId, limit, &hasMore)) {
    list.arr.push_back(hyt::messageToJson(row));
  }
  v.set("messages", list);
  v.set("hasMore", Value::boolean(hasMore));
  return v;
}

Value rpcSendMessage(const Value& params) {
  hyt::SendRequest request;
  request.sessionId = paramString(params, "sessionId");
  request.text = paramString(params, "text");
  request.userData = paramString(params, "userData");
  request.extOpts = paramString(params, "extOpts");

  const Value* at = params.find("at");
  if (at && at->type == Value::ARR && !at->arr.empty()) {
    request.isAt = true;
    if (request.userData.empty()) request.userData = buildAtUserData(*at);
    if (request.extOpts.empty()) {
      std::string comId = paramString(params, "comId");
      if (comId.empty()) comId = hyt::SdkHost::instance().comId();
      request.extOpts = buildAtExtOpts(*at, comId);
    }
  }

  hyt::SendResult result = hyt::SdkHost::instance().sendText(request);
  Value v = Value::object();
  v.set("ok", Value::boolean(result.ok));
  v.set("msgId", Value::string(result.msgId));
  v.set("ret", Value::number(result.ret));
  v.set("error", Value::string(result.error));
  return v;
}

Value rpcSendMedia(const Value& params) {
  hyt::SendRequest request;
  request.sessionId = paramString(params, "sessionId");
  request.filePath = paramString(params, "filePath");
  request.displayName = paramString(params, "fileName");
  request.userData = paramString(params, "userData");
  request.extOpts = paramString(params, "extOpts");
  request.rotate = paramInt(params, "rotate", 0);
  request.msgType = paramInt(params, "msgType", 0);
  if (request.msgType <= 0) request.msgType = inferMsgType(request.filePath);

  hyt::SendResult result = hyt::SdkHost::instance().sendMedia(request);
  Value v = Value::object();
  v.set("ok", Value::boolean(result.ok));
  v.set("msgId", Value::string(result.msgId));
  v.set("ret", Value::number(result.ret));
  v.set("error", Value::string(result.error));
  return v;
}

Value rpcDownload(const Value& params) {
  Value v = Value::object();
  std::string msgId = paramString(params, "msgId");
  if (msgId.empty()) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string("缺少 msgId"));
    return v;
  }
  auto store = storeIfOpen();
  if (!store) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string("本地 chatmsg.db 未打开"));
    return v;
  }
  hyt::StoredMessage message;
  if (!store->findMessage(msgId, &message)) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string("本地库找不到该消息"));
    return v;
  }
  int waitMs = paramInt(params, "waitMs", 5000);
  std::string account = hyt::SdkHost::instance().account();
  if (account.empty()) account = message.receiver;
  hyt::DownloadResult result =
      hyt::SdkHost::instance().download(message, account, waitMs);
  v.set("ok", Value::boolean(result.ok));
  v.set("pending", Value::boolean(result.pending));
  v.set("msgId", Value::string(result.msgId));
  v.set("path", Value::string(result.path));
  v.set("error", Value::string(result.error));
  return v;
}

Value rpcMergeContent(const Value& params) {
  Value v = Value::object();
  std::string msgId = paramString(params, "msgId");
  std::string content = paramString(params, "content");
  std::string title;
  auto store = storeIfOpen();
  hyt::StoredMessage message;
  if (!msgId.empty() && store && store->findMessage(msgId, &message)) {
    title = hyt::mergeTitle(message);
    if (content.empty() && !message.fileFullPath.empty()) {
      hyt::readFile(message.fileFullPath, &content);
    }
    if (content.empty()) content = message.msg;
  }
  std::vector<Value> entries;
  std::string error;
  if (!hyt::parseMergeEntries(content, &entries, &error)) {
    v.set("ok", Value::boolean(false));
    v.set("error", Value::string(error));
    return v;
  }
  Value list = Value::array();
  for (const auto& entry : entries) list.arr.push_back(entry);
  v.set("ok", Value::boolean(true));
  v.set("title", Value::string(title));
  v.set("entries", list);
  return v;
}

Value rpcSetEnv(const Value& params) {
  {
    std::lock_guard<std::mutex> lk(gSettingsMutex);
    if (params.has("env")) gLoginTemplate.env = paramString(params, "env");
    if (params.has("envFile")) gLoginTemplate.envFile = paramString(params, "envFile");
    if (params.has("sdkConfig")) gLoginTemplate.sdkConfig = paramString(params, "sdkConfig");
    if (params.has("pbsBase")) gLoginTemplate.pbsBase = paramString(params, "pbsBase");
    if (params.has("comId")) gLoginTemplate.comId = paramString(params, "comId");
  }
  Value v = Value::object();
  std::lock_guard<std::mutex> lk(gSettingsMutex);
  v.set("ok", Value::boolean(true));
  v.set("env", Value::string(gLoginTemplate.env));
  v.set("envFile", Value::string(gLoginTemplate.envFile));
  v.set("sdkConfig", Value::string(gLoginTemplate.sdkConfig));
  v.set("pbsBase", Value::string(gLoginTemplate.pbsBase));
  return v;
}

void handleRequest(hyt_socket fd, const Value& req) {
  Value id = req.find("id") ? *req.find("id") : Value();
  std::string method = req.getString("method");
  const Value* paramsPtr = req.find("params");
  Value params = paramsPtr ? *paramsPtr : Value::object();

  if (method == "ping") {
    Value result = Value::object();
    result.set("pong", Value::boolean(true));
    result.set("ts", Value::number((double)hyt::nowMs()));
    respond(fd, id, result);
  } else if (method == "bridge.info") {
    respond(fd, id, rpcInfo());
  } else if (method == "bridge.setEnv") {
    respond(fd, id, rpcSetEnv(params));
  } else if (method == "auth.login") {
    respond(fd, id, rpcAuthLogin(params));
  } else if (method == "auth.logout") {
    respond(fd, id, rpcAuthLogout());
  } else if (method == "auth.state") {
    respond(fd, id, rpcAuthState());
  } else if (method == "im.sessions") {
    respond(fd, id, rpcSessions(params));
  } else if (method == "im.groups") {
    respond(fd, id, rpcGroups());
  } else if (method == "im.members") {
    respond(fd, id, rpcMembers(params));
  } else if (method == "im.markRead") {
    respond(fd, id, rpcMarkRead(params));
  } else if (method == "im.recall") {
    respond(fd, id, rpcRecallMessage(params));
  } else if (method == "im.history") {
    respond(fd, id, rpcHistory(params));
  } else if (method == "im.sendMessage") {
    respond(fd, id, rpcSendMessage(params));
  } else if (method == "im.sendMedia") {
    respond(fd, id, rpcSendMedia(params));
  } else if (method == "im.download") {
    respond(fd, id, rpcDownload(params));
  } else if (method == "im.mergeContent") {
    respond(fd, id, rpcMergeContent(params));
  } else {
    respondError(fd, id, -32601, "method not found: " + method);
  }
}

void clientLoop(hyt_socket fd) {
  std::string buffer;
  char buf[8192];
  while (true) {
#ifdef _WIN32
    int n = recv(fd, buf, sizeof(buf), 0);
#else
    ssize_t n = recv(fd, buf, sizeof(buf), 0);
#endif
    if (n <= 0) break;
    buffer.append(buf, (size_t)n);
    size_t pos;
    while ((pos = buffer.find('\n')) != std::string::npos) {
      std::string line = buffer.substr(0, pos);
      buffer.erase(0, pos + 1);
      if (line.empty()) continue;
      Value req;
      if (!Value::parse(line, req)) continue;
      handleRequest(fd, req);
    }
  }
  {
    std::lock_guard<std::mutex> lk(gClientsMutex);
    for (auto it = gClients.begin(); it != gClients.end(); ++it) {
      if (*it == fd) {
        gClients.erase(it);
        break;
      }
    }
  }
  netClose(fd);
  hyt::logInfo("客户端断开连接");
}

bool readBridgeInfo(long long* pid, int* port) {
  std::string text;
  if (!hyt::readFile(hyt::joinPath(hyt::configDir(), "bridge.json"), &text)) return false;
  Value v;
  if (!Value::parse(text, v)) return false;
  if (pid) *pid = (long long)v.getNumber("pid", 0);
  if (port) *port = (int)v.getNumber("port", 0);
  return true;
}

void writeBridgeInfo(int port) {
  Value v = Value::object();
  v.set("host", Value::string("127.0.0.1"));
  v.set("port", Value::number(port));
  v.set("pid", Value::number((double)pidValue()));
  v.set("startedAt", Value::number((double)hyt::nowMs()));
  hyt::ensureDir(hyt::configDir());
  hyt::writeFileAtomic(hyt::joinPath(hyt::configDir(), "bridge.json"), v.dump());
}

void storeHooks() {
  auto& sdk = hyt::SdkHost::instance();
  sdk.setStoreHooks(
      [](const hyt::OwnMessage& own, std::string* error) {
        std::lock_guard<std::mutex> lk(gStoreMutex);
        if (!gStore || !gStore->available()) {
          if (error) *error = "chatmsg.db 未打开";
          return false;
        }
        return gStore->insertOwnMessage(own, error);
      },
      [](const std::string& key, hyt::StoredMessage* out) {
        std::lock_guard<std::mutex> lk(gStoreMutex);
        if (!gStore || !gStore->available()) return false;
        return gStore->findMessage(key, out);
      },
      [](const std::string& msgId, const std::string& path, std::string* error) {
        std::lock_guard<std::mutex> lk(gStoreMutex);
        if (!gStore || !gStore->available()) {
          if (error) *error = "chatmsg.db 未打开";
          return false;
        }
        return gStore->updateFileFullPath(msgId, path, error);
      });
}

}  // namespace

int main(int argc, char** argv) {
  gStartedAt = hyt::nowMs();
  // 正常 return 或 SDK 内部 exit() 会走到这里；被 TerminateProcess 杀死时不会，
  // 排查「登录后进程消失」时就靠这一行区分。
  std::atexit([]() { hyt::logInfo("bridge 进程正常退出（atexit）"); });
#ifdef _WIN32
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
    fprintf(stderr, "WSAStartup failed\n");
    return 1;
  }
#endif

  int port = 37210;
  if (const char* env = getenv("HYT_BRIDGE_PORT")) port = atoi(env);
  if (const char* env = getenv("NEWHYT_BRIDGE_PORT")) port = atoi(env);
  for (int i = 1; i < argc; ++i) {
    if (strcmp(argv[i], "--port") == 0 && i + 1 < argc) port = atoi(argv[++i]);
    if (strcmp(argv[i], "--verbose") == 0) gVerbose = true;
  }

  hyt::ensureDir(hyt::configDir());
  hyt::ensureDir(hyt::joinPath(hyt::configDir(), "logs"));
  hyt::logSetFile(hyt::joinPath(hyt::joinPath(hyt::configDir(), "logs"), "bridge.log"));
  hyt::logSetLevel(gVerbose ? hyt::LOG_DEBUG : hyt::LOG_INFO);

#ifdef _WIN32
  // 单实例：桌面端的多个插件宿主（sidecar、窗口、命令行 server）会同时拉起 bridge，
  // 每个 bridge 都登录同一账号时服务端会把彼此踢下线。命名互斥体是进程级保证，
  // 比发现文件和端口占用都可靠。句柄要一直持有到进程退出。
  gInstanceMutex = CreateMutexW(nullptr, FALSE, L"Local\\hyt-native-bridge-single-instance");
  if (gInstanceMutex != nullptr && GetLastError() == ERROR_ALREADY_EXISTS) {
    hyt::logInfo("已有 bridge 实例在运行，本次启动退出");
    fprintf(stderr, "another bridge is running\n");
    return 0;
  }
#endif

  long long existingPid = 0;
  int existingPort = 0;
  if (readBridgeInfo(&existingPid, &existingPort) && processAlive(existingPid) &&
      existingPid != pidValue()) {
    fprintf(stderr,
            "another bridge is running (pid=%lld port=%d); 如确认无进程请删除 %s\n",
            existingPid, existingPort,
            hyt::joinPath(hyt::configDir(), "bridge.json").c_str());
    return 0;
  }

  hyt::SdkHost::instance().setSink(
      [](const std::string& method, const Value& params) { broadcast(method, params); });
  storeHooks();

  hyt_socket server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) {
    hyt::logError("创建监听 socket 失败");
    return 1;
  }
#ifdef _WIN32
  // Windows 的 SO_REUSEADDR 允许多个进程同时绑定同一端口，重复启动的 bridge 会各自
  // 登录同一账号并把彼此踢下线（服务端返回 code=4 强制下线）。必须用独占绑定。
  BOOL exclusive = TRUE;
  setsockopt(server, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char*)&exclusive,
             sizeof(exclusive));
#else
  int opt = 1;
  setsockopt(server, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#endif
  sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = htons((unsigned short)port);
  if (bind(server, (sockaddr*)&addr, sizeof(addr)) != 0) {
    hyt::logError("绑定 127.0.0.1:%d 失败（端口可能被占用）", port);
    netClose(server);
    return 1;
  }
  if (listen(server, 16) != 0) {
    hyt::logError("listen 失败");
    netClose(server);
    return 1;
  }

  writeBridgeInfo(port);
  // 发现文件可能被清理、覆盖或被复制到别处：定期确认它仍指向本进程，否则重写，
  // 否则运行中的实例会变得不可发现，其他进程只能重复启动并撞端口。
  std::thread([](int port) {
    while (true) {
      hyt::sleepMs(5000);
      long long pid = 0;
      int found = 0;
      if (!readBridgeInfo(&pid, &found) || pid != pidValue() || found != port) writeBridgeInfo(port);
    }
  }, port).detach();
  hyt::logInfo("hyt-native-bridge %s 监听 127.0.0.1:%d，chRoot=%s（初始化 EC SDK）",
               kBridgeVersion, port, hyt::chRootDir().c_str());

  // 先把端口和 bridge.json 暴露出去：EC SDK 初始化要数秒，
  // 调用方只等 bridge.json 出现，不应被初始化阻塞。
  hyt::SdkHost::instance().initialize();
  openNewestStore();

  while (true) {
    sockaddr_in clientAddr;
    socklen_t clientLen = sizeof(clientAddr);
    hyt_socket fd = accept(server, (sockaddr*)&clientAddr, &clientLen);
    if (fd < 0) {
#ifdef _WIN32
      if (WSAGetLastError() == WSAEINTR) continue;
#else
      if (errno == EINTR) continue;
#endif
      hyt::logError("accept 失败");
      continue;
    }
#ifdef SO_NOSIGPIPE
    {
      int one = 1;
      setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, (const char*)&one, sizeof(one));
    }
#endif
    {
      std::lock_guard<std::mutex> lk(gClientsMutex);
      gClients.push_back(fd);
    }
    gClientSeq++;
    hyt::logInfo("客户端接入 #%d", gClientSeq.load());
    std::thread(clientLoop, fd).detach();
  }
  return 0;
}
