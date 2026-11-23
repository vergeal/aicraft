#include "sdk_host.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <thread>

#include "audio_guard.hpp"
#include "message.hpp"
#include "util.hpp"

#ifdef HYT_WITH_EC_SDK
#include "ECImInterface.h"
#include "ECImStructDef.h"
#include "ECInterface.h"
#include "ECStructDef.h"
#endif

namespace hyt {
namespace {

#ifdef HYT_WITH_EC_SDK

// Windows 版 SDK 头文件还没有 69（语音已读通知），按 macOS 头文件里的值补齐，
// 两个平台走同一套判断。
constexpr int kMsgTypeReadVoiceNotify = 69;

ECGeneralCallBackInterface gGeneralCallbacks;
ECMessageCallBackInterface gMessageCallbacks;
bool gCallbacksReady = false;

std::string ecStr(const char* text) { return text ? std::string(text) : std::string(); }

bool isFileType(int msgType) {
  return msgType == Msg_Type_File || msgType == Msg_Type_File_UnCompress ||
         msgType == Msg_Type_File_Big;
}

// 客户端对 6/7/15 的 userData 传的是 base64(JSON)；入库统一保存 JSON 原文。
std::string normalizeUserData(int msgType, const std::string& raw) {
  if (!isFileType(msgType) || raw.empty()) return raw;
  std::string t = trim(raw);
  if (!t.empty() && (t[0] == '{' || t[0] == '[')) return t;
  if (t.find("\"sMsgType\"") != std::string::npos) return t;
  std::string decoded;
  if (!base64Decode(t, &decoded)) return raw;
  std::string d = trim(decoded);
  if (d.empty() || (d[0] != '{' && d[0] != '[')) return raw;
  return d;
}

// 客户端 chatmsg.FileUrl 保存相对路径；SDK 回调里可能是完整 URL。
std::string relativeFileUrl(const std::string& url) {
  size_t scheme = url.find("://");
  if (scheme == std::string::npos) return url;
  size_t slash = url.find('/', scheme + 3);
  if (slash == std::string::npos) return "/";
  return url.substr(slash);
}

StoredMessage storedFromEc(ECMessage* msg) {
  StoredMessage s;
  if (!msg) return s;
  s.msgType = (int)msg->msgType;
  s.msgId = ecStr(msg->msgId);
  s.createdTime = ecStr(msg->dateCreated);
  s.sender = ecStr(msg->sender);
  s.receiver = ecStr(msg->receiver);
  s.msg = ecStr(msg->msgContent);
  std::string userData = ecStr(msg->userData);
  if (userData.empty() && msg->userDataEx) {
    userData.assign(msg->userDataEx, (size_t)msg->userDataExSize);
  }
  s.userData = normalizeUserData(s.msgType, userData);
  s.senderNick = ecStr(msg->senderNickName);
  s.fileName = ecStr(msg->fileName);
  s.fileUrl = relativeFileUrl(ecStr(msg->fileUrl));
  s.sessionId = ecStr(msg->sessionId);
  s.sessionType = msg->sessionType;
  s.chatType = msg->sessionType;
  s.fileSize = (long long)msg->fileSize;
  s.originFileSize = (long long)msg->originFileSize;
  s.isAt = msg->isAt;
  if (s.sessionId.empty()) {
    s.sessionId = msg->sessionType == 1 ? s.receiver : s.sender;
  }
  return s;
}

// 底层日志量很大且包含整包消息 JSON，只把排查登录/连接需要的单行转进 bridge 日志。
bool worthRelayingSdkLog(const std::string& line) {
  static const char* keys[] = {
      "kickoffText", "ConnectErr",         "registrationStateChanged",
      "onConnect",   "protoerror",         "LoginEx2",
      "Logout",
  };
  for (const char* key : keys) {
    if (line.find(key) != std::string::npos) return true;
  }
  return false;
}

void installCallbacks() {
  if (gCallbacksReady) return;
  gCallbacksReady = true;

  gGeneralCallbacks.pfonLogInfo = [](const char* info) {
    if (!info) return;
    for (const auto& rawLine : split(std::string(info), '\n')) {
      std::string line = trim(rawLine);
      if (line.empty() || !worthRelayingSdkLog(line)) continue;
      // 回调里会夹带消息正文，排查登录不需要，也不能把聊天内容写进日志。
      if (line.find("msgContent") != std::string::npos) continue;
      if (line.size() > 300) line = line.substr(0, 300) + "…";
      logInfo("[sdk] %s", line.c_str());
    }
  };
  gGeneralCallbacks.pfonConnectState = [](const ECConnectState state) {
    SdkHost::instance().handleConnectState((int)state.code, state.reason);
  };
  gGeneralCallbacks.pfonLogOut = [](int reason) {
    SdkHost::instance().handleLogout(reason);
  };

  gMessageCallbacks.pfonReceiveMessage = [](ECMessage* msg) {
    SdkHost::instance().handleReceive(msg, false);
  };
  gMessageCallbacks.pfonReceiveOfflineMessage = [](ECMessage* msg) {
    SdkHost::instance().handleReceive(msg, true);
  };
  gMessageCallbacks.pfonReceiveFile = [](ECMessage* msg) {
    SdkHost::instance().handleReceive(msg, false);
  };
  gMessageCallbacks.pfonReceiveNoVersionMessage = [](ECMessage* msg) {
    SdkHost::instance().handleReceive(msg, false);
  };
  gMessageCallbacks.pfonReceiveOperateNoticeMessage = [](ECMessage* msg) {
    SdkHost::instance().handleReceive(msg, false);
  };
  gMessageCallbacks.pfonReceiveServerUndefineMessage = [](ECMessage* msg) {
    SdkHost::instance().handleReceive(msg, false);
  };
  gMessageCallbacks.pfonSendTextMessage =
      [](unsigned int key, int reason, ECMessage* msg) {
        SdkHost::instance().handleSendTextResult(key, reason, msg);
      };
  gMessageCallbacks.pfonSendMediaFile =
      [](unsigned int key, int reason, ECMessage* msg, const char*) {
        SdkHost::instance().handleSendMediaResult(key, reason, msg);
      };
  gMessageCallbacks.pfonDownloadFileComplete =
      [](unsigned int key, int reason, ECMessage* msg) {
        SdkHost::instance().handleDownloadResult(key, reason, msg);
      };
  gMessageCallbacks.pfonRateOfProgressAttach =
      [](unsigned int key, unsigned long long uploaded, unsigned long long total,
         ECMessage*) {
        SdkHost::instance().handleUploadProgress(key, uploaded, total, nullptr);
      };
  gMessageCallbacks.pfonOfflineMessageCount = [](int count) {
    SdkHost::instance().handleOfflineCount(count);
  };
  gMessageCallbacks.pfonOfflineMessageComplete = []() {
    SdkHost::instance().handleOfflineComplete();
  };
  gMessageCallbacks.pfonQueryOwnGroup =
      [](unsigned int, int reason, int count, ECGroupSimpleInfo* info) {
        std::vector<std::pair<std::string, std::string>> groups;
        if (reason == EC_Response_Success && info) {
          for (int i = 0; i < count; ++i) {
            groups.emplace_back(ecStr(info[i].groupId), ecStr(info[i].name));
          }
        }
        SdkHost::instance().handleOwnGroups(groups);
      };
  gMessageCallbacks.pfonQueryGroupMember =
      [](unsigned int key, int reason, const char*, int count, ECGroupMember* info) {
        std::vector<MemberInfo> members;
        if (reason == EC_Response_Success && info) {
          for (int i = 0; i < count; ++i) {
            MemberInfo m;
            m.account = ecStr(info[i].member);
            m.name = ecStr(info[i].nickName);
            m.role = info[i].role;
            m.sex = info[i].sex;
            members.push_back(m);
          }
        }
        SdkHost::instance().handleQueryMembers(key, reason, members);
      };
  gMessageCallbacks.pfonReadMessage = [](unsigned int key, int reason) {
    SdkHost::instance().handleReadResult(key, reason);
  };
  gMessageCallbacks.pfonReceiveGroupNoticeMessage =
      [](const ECGroupNoticeMessage* notice) {
        nhjson::Value p = nhjson::Value::object();
        p.set("notice", nhjson::Value::number(notice ? (int)notice->notice : -1));
        p.set("msgId", nhjson::Value::string(ecStr(notice ? notice->msgId : "")));
        SdkHost::instance().handleGroupNotice(p);
      };
}

#endif  // HYT_WITH_EC_SDK

// ECConnectStateCode 的数值与 SDK 头文件一致；这里用常量避免 stub 分支引用 SDK 类型。
enum {
  kConnectSuccess = 0,
  kConnecting = 1,
  kConnectFailed = 2,
  kConnectKickOff = 3,
  kConnectForceLogOff = 4,
};

struct PbsInfo {
  std::string appId;
  std::string appToken;
  std::string comId;
  std::string account;
  std::string nickname;
};

std::string iniValue(const std::string& file, const std::string& section,
                     const std::string& key) {
  std::string content;
  if (file.empty() || !readFile(file, &content)) return "";
  bool inSection = false;
  for (const auto& rawLine : split(content, '\n')) {
    std::string line = trim(rawLine);
    if (line.empty() || line[0] == '#' || line[0] == ';') continue;
    if (line.front() == '[' && line.back() == ']') {
      inSection = line.substr(1, line.size() - 2) == section;
      continue;
    }
    if (!inSection) continue;
    size_t eq = line.find('=');
    if (eq == std::string::npos) continue;
    if (trim(line.substr(0, eq)) == key) return trim(line.substr(eq + 1));
  }
  return "";
}

// 文件服务器地址：优先 sdk_server 段，其次环境默认域名。
std::string fileServerBase(const std::string& envFile, const std::string& env) {
  std::string domain = iniValue(envFile, "sdk_server", "domain");
  std::string port = iniValue(envFile, "sdk_server", "file_port");
  if (domain.empty()) {
    domain = env == "test" ? "chimrx.changhong.com" : "chim.changhong.com";
  }
  if (port.empty()) port = "8090";
  return "https://" + domain + ":" + port;
}

// 与 GUI 一致：账号密码登录时自动找 CHFile/Config 下的环境副本，
// 避免调用方不传 envFile/sdkConfig 时落到 SDK 内置的默认地址。
std::string firstExisting(const std::vector<std::string>& paths) {
  for (const auto& path : paths) {
    if (fileExists(path)) return path;
  }
  return "";
}

std::string defaultSdkConfig(const std::string& env) {
  std::string config = configDir();
  std::vector<std::string> candidates;
  if (env == "test") candidates.push_back(joinPath(config, "sdk_server_config_test.xml"));
  candidates.push_back(joinPath(config, "sdk_server_config.xml"));
  candidates.push_back(joinPath(config, "sdk_server_config_wai.xml"));
  candidates.push_back(joinPath(config, "sdk_server_config_nei.xml"));
  return firstExisting(candidates);
}

std::string defaultEnvFile(const std::string& env) {
  std::string config = configDir();
  std::vector<std::string> candidates;
  if (env == "test") candidates.push_back(joinPath(config, "rxSettings_test.ini"));
  candidates.push_back(joinPath(config, "rxSettings.ini"));
  candidates.push_back(joinPath(config, "rxSettings_wai.ini"));
  candidates.push_back(joinPath(config, "rxSettings_nei.ini"));
  return firstExisting(candidates);
}

// 客户端登录前会用 CCPsetAppInfo 上报应用版本；服务端会记录并按版本做策略校验，
// 不设置就等于以空版本登录。优先环境变量覆盖，其次用 CHFile/Config 里客户端下发的版本。
std::string resolveAppVersion(const std::string& envFile) {
  if (const char* env = getenv("HYT_APP_VERSION")) {
    if (*env) return env;
  }
  return iniValue(envFile, "app_config", "version");
}

// 与客户端一致：先 PBS thirdLogin 换取 appId/appToken/comId/account。
bool pbsLogin(const LoginOptions& options, PbsInfo* out, std::string* error) {
  std::string base = options.pbsBase;
  if (base.empty()) {
    std::string httpType = iniValue(options.envFile, "pbs_server", "http_type");
    std::string domain = iniValue(options.envFile, "pbs_server", "domain");
    std::string port = iniValue(options.envFile, "pbs_server", "port");
    if (domain.empty()) {
      domain = options.env == "test" ? "chimrx.changhong.com" : "chim.changhong.com";
      port = "7773";
      httpType = "https";
    }
    if (httpType.empty()) httpType = "https";
    if (port.empty()) port = "7773";
    base = httpType + "://" + domain + ":" + port;
  }
  while (!base.empty() && base.back() == '/') base.pop_back();

  nhjson::Value head = nhjson::Value::object();
  head.set("useragent", nhjson::Value::string("Rongxin_Client_PC;Rongxin_Client_PC;0.7.5;Rongxin_Client_PC;"));
  head.set("reqtime", nhjson::Value::string(logTime()));

  nhjson::Value body = nhjson::Value::object();
  body.set("countrycode", nhjson::Value::string("+86"));
  body.set("loginName", nhjson::Value::string(options.userName));
  body.set("userpasswd", nhjson::Value::string(md5Hex(options.password)));
  body.set("type", nhjson::Value::number(11));
  body.set("compId", nhjson::Value::string(options.comId));
  body.set("version", nhjson::Value::string("0.7.13"));
  body.set("completeCode", nhjson::Value::string("723DFBBAD9EC35DEAE6A75538C223A07"));
  body.set("aesPwd", nhjson::Value::string(aesEncryptBase64(
                          options.password, "yuntongxun123456", "0000000000000000")));
  body.set("appType", nhjson::Value::string("2"));

  nhjson::Value request = nhjson::Value::object();
  request.set("head", head);
  request.set("body", body);
  nhjson::Value root = nhjson::Value::object();
  root.set("Request", request);

  HttpResult http = httpPostJson(base + "/common/login/thirdLogin", root.dump(), 10);
  if (!http.ok) {
    *error = "PBS 登录请求失败: " + (http.error.empty() ? std::to_string(http.status) : http.error);
    return false;
  }

  nhjson::Value response;
  if (!nhjson::Value::parse(http.body, response)) {
    *error = "PBS 响应不是合法 JSON";
    return false;
  }
  const nhjson::Value* resp = response.find("Response");
  if (!resp) {
    *error = "PBS 响应缺少 Response 字段";
    return false;
  }
  const nhjson::Value* responseHead = resp->find("head");
  if (!responseHead) {
    *error = "PBS 响应缺少 head 字段";
    return false;
  }
  std::string statusCode = responseHead->getString("statusCode");
  if (statusCode.empty() && responseHead->find("statusCode") &&
      responseHead->find("statusCode")->type == nhjson::Value::NUM) {
    statusCode = std::to_string((long long)responseHead->getInt("statusCode"));
  }
  if (statusCode != "000000") {
    std::string statusMsg = responseHead->getString("statusMsg");
    *error = "PBS 登录失败: " + (statusMsg.empty() ? statusCode : statusMsg) +
             " (" + statusCode + ")";
    return false;
  }
  const nhjson::Value* responseBody = resp->find("body");
  if (!responseBody) {
    *error = "PBS 响应缺少 body 字段";
    return false;
  }
  out->appId = responseBody->getString("appid");
  out->appToken = responseBody->getString("apptoken");
  out->comId = responseBody->getString("companyid");
  out->account = responseBody->getString("account");
  out->nickname = responseBody->getString("nickname");
  if (out->appId.empty() || out->appToken.empty() || out->account.empty()) {
    *error = "PBS 登录成功但缺少 appid/apptoken/account";
    return false;
  }
  return true;
}

}  // namespace

SdkHost& SdkHost::instance() {
  static SdkHost host;
  return host;
}

void SdkHost::setSink(EventSink sink) {
  std::lock_guard<std::mutex> lk(stateMutex_);
  sink_ = std::move(sink);
}

void SdkHost::setStoreHooks(StoreWrite write, StoreLookup lookup, StoreUpdate update) {
  std::lock_guard<std::mutex> lk(stateMutex_);
  storeWrite_ = std::move(write);
  storeLookup_ = std::move(lookup);
  storeUpdate_ = std::move(update);
}

void SdkHost::initialize() {
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    if (initialized_) return;
    initialized_ = true;
  }

#ifdef HYT_WITH_EC_SDK
  installCallbacks();
  std::string logPath = joinPath(joinPath(configDir(), "logs"), "sdk.log");
  ensureDir(joinPath(configDir(), "logs"));
  // level 12 = EC_LOG_LEVEL_LAYER_DEBUG，只有到这一级才记录服务端原始回包与 reason，
  // 排查登录被拒（例如 code=4）时必须要看到这些内容。
  SetTraceFlag(12, logPath.c_str());
  SetGeneralCallBackFuction(&gGeneralCallbacks);
  SetMessageCallBackFunction(&gMessageCallbacks);

  // 必须在初始化之前：SDK 一启动就会用 WASAPI 枚举录音设备，安全软件会把它当成
  // 正在使用麦克风；这里让录音设备对 SDK 不可见，播放设备照常。
  suppressMicrophoneAccess();

  int ret = ECSDK_Initialize();
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    available_ = ret == 0;
    unavailableReason_ = ret == 0 ? "" : "ECSDK_Initialize 失败（" + std::to_string(ret) + "）";
  }
  if (ret == 0) {
    logInfo("EC SDK 初始化成功");
  } else {
    logError("ECSDK_Initialize 失败: %d", ret);
  }
#else
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    available_ = false;
    unavailableReason_ =
        "该平台未链接 EC SDK（缺少 libECsdk），仅本地历史/会话可用";
  }
  logError("%s", unavailableReason_.c_str());
#endif
}

LoginResult SdkHost::login(const LoginOptions& options) {
  // 多个插件进程（桌面端 sidecar、命令行 server、窗口）会同时对同一个桥登录。
  // 并发登录会互相打断传输连接，所以串行化；已经在线的请求直接复用当前会话。
  std::lock_guard<std::mutex> gate(loginMutex_);
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    if (loggedIn_) {
      LoginResult ready;
      ready.ok = true;
      ready.account = account_;
      ready.message = "已登录";
      ready.connectCode = 0;
      ready.reason = 200;
      return ready;
    }
  }

  LoginResult result;
  initialize();
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    if (!available_) {
      result.message = unavailableReason_;
      return result;
    }
  }
  if (options.userName.empty() || options.password.empty()) {
    result.message = "缺少账号或密码";
    return result;
  }

  LoginOptions effective = options;
  if (effective.sdkConfig.empty()) effective.sdkConfig = defaultSdkConfig(effective.env);
  if (effective.envFile.empty()) effective.envFile = defaultEnvFile(effective.env);
  {
    // 先记录实际使用的环境，PBS 失败时 auth.state 也能看到探测结果。
    std::lock_guard<std::mutex> lk(stateMutex_);
    env_ = effective.env;
    envFile_ = effective.envFile;
    sdkConfig_ = effective.sdkConfig;
  }

  std::string appId = effective.appId;
  std::string appToken = effective.appToken;
  std::string comId = effective.comId;
  std::string account = effective.userName;
  std::string nickname;
  if (appId.empty() || appToken.empty()) {
    PbsInfo info;
    std::string error;
    if (!pbsLogin(effective, &info, &error)) {
      result.message = error;
      return result;
    }
    appId = info.appId;
    appToken = info.appToken;
    if (!info.comId.empty()) comId = info.comId;
    account = info.account;
    nickname = info.nickname;
  }

  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    account_ = account;
    comId_ = comId;
  }

#ifdef HYT_WITH_EC_SDK
  std::string xml = effective.sdkConfig;
  if (xml.empty() && endsWith(toLower(effective.envFile), ".xml")) xml = effective.envFile;
  if (!xml.empty()) {
    // 与真实客户端一致：环境类型固定 1，实际地址来自 xml。
    int envRet = SetServerEnvType(1, xml.c_str());
    if (envRet != 0) logError("SetServerEnvType 失败: %d (%s)", envRet, xml.c_str());
  }

  ECLoginInfo loginInfo;
  loginInfo.authType = LoginAuthType_NormalAuth;
  loginInfo.username = const_cast<char*>(account.c_str());
  loginInfo.userPassword = const_cast<char*>(effective.password.c_str());
  loginInfo.appKey = const_cast<char*>(appId.c_str());
  loginInfo.appToken = const_cast<char*>(appToken.c_str());
  long long numericComId = strtoll(comId.c_str(), nullptr, 10);
  std::string extra = "{\"comId\":" + std::to_string(numericComId) +
                      ",\"compId\":" + std::to_string(numericComId) + "}";

  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    connectCode_ = -1;
    connectReason_ = 0;
    loggedIn_ = false;
    connected_ = false;
  }

  const std::string appVersion = resolveAppVersion(effective.envFile);
  if (!appVersion.empty()) {
    std::string appInfo = "{\"appversion\":\"" + appVersion + "\"}";
    int infoRet = CCPsetAppInfo(appInfo.c_str());
    if (infoRet != 0) {
      logError("CCPsetAppInfo 失败: %d (%s)", infoRet, appInfo.c_str());
    } else {
      logInfo("上报应用版本 %s", appVersion.c_str());
    }
  } else {
    logError("未找到客户端应用版本（HYT_APP_VERSION 或 app_config.version），将以空版本登录");
  }

  int ret = LoginEx2(&loginInfo, effective.mode, extra.c_str());
  if (ret != 0) {
    result.ret = ret;
    result.message = "LoginEx2 调用失败（" + std::to_string(ret) + "）";
    return result;
  }

  std::unique_lock<std::mutex> lk(stateMutex_);
  int waitMs = effective.waitMs > 0 ? effective.waitMs : 5000;
  stateCv_.wait_for(lk, std::chrono::milliseconds(waitMs), [this] {
    return connectCode_ == 0 || connectCode_ == 2 || connectCode_ == 3 ||
           connectCode_ == 4;
  });
  result.account = account_;
  result.ret = connectCode_;
  result.connectCode = connectCode_;
  result.reason = connectReason_;
  if (connectCode_ == 0) {
    result.ok = true;
    result.message = "登录成功";
  } else if (connectCode_ < 0 || connectCode_ == 1) {
    result.pending = true;
    result.message = "登录请求已提交，等待连接状态回调";
  } else if (connectCode_ == kConnectKickOff) {
    result.message = "该账号已在其他设备登录，本端被踢下线（reason=" +
                     std::to_string(connectReason_) + "）";
  } else if (connectCode_ == kConnectForceLogOff) {
    result.message = "账号被服务器强制下线（reason=" + std::to_string(connectReason_) +
                     "）；客户端版本或登录设备可能不符合服务端策略";
  } else {
    result.message = "连接失败（code=" + std::to_string(connectCode_) +
                     " reason=" + std::to_string(connectReason_) + "）";
  }
  (void)nickname;
  return result;
#else
  (void)appId;
  (void)appToken;
  (void)comId;
  (void)nickname;
  result.message = unavailableReason_;
  return result;
#endif
}

bool SdkHost::logout(std::string* error) {
#ifdef HYT_WITH_EC_SDK
  if (!available_) {
    if (error) *error = unavailableReason_;
    return false;
  }
  int ret = Logout();
  if (ret != 0) {
    if (error) *error = "Logout 调用失败（" + std::to_string(ret) + "）";
    return false;
  }
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    loggedIn_ = false;
    connected_ = false;
  }
  if (error) error->clear();
  return true;
#else
  if (error) *error = unavailableReason_;
  return false;
#endif
}

SendResult SdkHost::sendText(const SendRequest& request) {
  SendResult result;
#ifdef HYT_WITH_EC_SDK
  if (!available_) {
    result.error = unavailableReason_;
    return result;
  }
  if (!loggedIn() || !connected()) {
    result.error = "未登录或未连接";
    return result;
  }
  if (request.sessionId.empty() || request.text.empty()) {
    result.error = "缺少 sessionId 或文本内容";
    return result;
  }

  unsigned int matchKey = 0;
  char msgId[128] = {0};
  int ret = SendTextMessageEX(&matchKey, request.sessionId.c_str(), request.text.c_str(),
                              Msg_Type_Text, request.userData.c_str(), msgId,
                              request.extOpts.c_str());
  result.ret = ret;
  result.msgId = msgId;
  if (ret != 0) {
    result.error = "SendTextMessageEX 失败（" + std::to_string(ret) + "）";
    return result;
  }
  if (matchKey != 0) {
    PendingSend pending;
    pending.sessionId = request.sessionId;
    pending.text = request.text;
    pending.userData = request.userData;
    pending.msgType = request.msgType;
    pending.isAt = request.isAt;
    pending.media = false;
    std::lock_guard<std::mutex> lk(pendingMutex_);
    pendingSends_[matchKey] = pending;
  }
  result.ok = true;
  return result;
#else
  result.error = unavailableReason_;
  return result;
#endif
}

SendResult SdkHost::sendMedia(const SendRequest& request) {
  SendResult result;
#ifdef HYT_WITH_EC_SDK
  if (!available_) {
    result.error = unavailableReason_;
    return result;
  }
  if (!loggedIn() || !connected()) {
    result.error = "未登录或未连接";
    return result;
  }
  if (request.sessionId.empty() || request.filePath.empty()) {
    result.error = "缺少 sessionId 或文件路径";
    return result;
  }
  if (!fileExists(request.filePath)) {
    result.error = "文件不存在: " + request.filePath;
    return result;
  }

  int msgType = request.msgType > 0 ? request.msgType : Msg_Type_File;
  int rotate = request.rotate;
  if (rotate <= 0 && msgType == Msg_Type_Video) rotate = 90;

  std::string uuid = uniqueSuffix();
  unsigned int matchKey = 0;
  char msgId[128] = {0};
  int ret = SendMediaMessageEX(&matchKey, request.sessionId.c_str(),
                               request.filePath.c_str(), (MsgType)msgType,
                               request.userData.c_str(), msgId, const_cast<char*>(""),
                               request.extOpts.c_str(), rotate, uuid.c_str(),
                               request.displayName.c_str());
  result.ret = ret;
  result.msgId = msgId;
  if (ret != 0) {
    result.error = "SendMediaMessageEX 失败（" + std::to_string(ret) + "）";
    return result;
  }
  if (matchKey != 0) {
    PendingSend pending;
    pending.sessionId = request.sessionId;
    pending.text = request.text;
    pending.userData = request.userData;
    pending.filePath = request.filePath;
    pending.displayName = request.displayName;
    pending.msgType = msgType;
    pending.isAt = request.isAt;
    pending.media = true;
    std::lock_guard<std::mutex> lk(pendingMutex_);
    pendingSends_[matchKey] = pending;
  }
  result.ok = true;
  return result;
#else
  result.error = unavailableReason_;
  return result;
#endif
}

MemberResult SdkHost::queryMembers(const std::string& groupId, int waitMs) {
  MemberResult result;
#ifdef HYT_WITH_EC_SDK
  if (!available_) {
    result.error = unavailableReason_;
    return result;
  }
  if (!connected()) {
    result.error = "未登录或未连接";
    return result;
  }
  auto wait = std::make_shared<MemberWait>();
  unsigned int matchKey = 0;
  int ret = QueryGroupMember(&matchKey, groupId.c_str(), "", 200);
  if (ret != 0) {
    result.error = "QueryGroupMember 失败（" + std::to_string(ret) + "）";
    return result;
  }
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    pendingMembers_[matchKey] = wait;
  }

  std::unique_lock<std::mutex> lk(wait->mutex);
  int timeout = waitMs > 0 ? waitMs : 5000;
  if (!wait->cv.wait_for(lk, std::chrono::milliseconds(timeout),
                         [&wait] { return wait->done; })) {
    result.error = "等待成员列表超时";
    return result;
  }
  result.ok = wait->reason == EC_Response_Success;
  result.members = wait->members;
  if (!result.ok) {
    result.error = "查询成员失败（reason=" + std::to_string(wait->reason) + "）";
  }
  return result;
#else
  (void)groupId;
  (void)waitMs;
  result.error = unavailableReason_;
  return result;
#endif
}

ReadResult SdkHost::markRead(const std::string& msgId, bool group, int waitMs) {
  ReadResult result;
  result.msgId = msgId;
#ifdef HYT_WITH_EC_SDK
  if (!available_) {
    result.error = unavailableReason_;
    return result;
  }
  if (!connected()) {
    result.error = "未登录或未连接";
    return result;
  }
  auto wait = std::make_shared<ReadWait>();
  unsigned int matchKey = 0;
  int ret = group ? ReadMessageGroup(&matchKey, msgId.c_str())
                  : ReadMessage(&matchKey, msgId.c_str());
  if (ret != 0) {
    result.error = "上报已读失败（" + std::to_string(ret) + "）";
    return result;
  }
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    pendingReads_[matchKey] = wait;
  }

  std::unique_lock<std::mutex> lk(wait->mutex);
  int timeout = waitMs > 0 ? waitMs : 3000;
  if (!wait->cv.wait_for(lk, std::chrono::milliseconds(timeout),
                         [&wait] { return wait->done; })) {
    result.error = "等待已读上报结果超时";
    return result;
  }
  result.ok = wait->reason == EC_Response_Success;
  if (!result.ok) {
    result.error = "服务端拒绝了已读上报（reason=" + std::to_string(wait->reason) + "）";
  }
  return result;
#else
  (void)group;
  (void)waitMs;
  result.error = unavailableReason_;
  return result;
#endif
}

DownloadResult SdkHost::download(const StoredMessage& message,
                                 const std::string& account, int waitMs) {
  DownloadResult result;
  result.msgId = message.msgId;
#ifdef HYT_WITH_EC_SDK
  if (!available_) {
    result.error = unavailableReason_;
    return result;
  }
  if (!connected()) {
    result.error = "未登录或未连接";
    return result;
  }
  if (message.fileUrl.empty()) {
    result.error = "消息没有 fileUrl";
    return result;
  }
  if (message.msgId.empty()) {
    result.error = "消息没有 msgId";
    return result;
  }

  long long stamp = nowMs();
  std::string url = message.fileUrl;
  size_t query = url.find('?');
  if (query != std::string::npos) url = url.substr(0, query);
  if (url.find("://") == std::string::npos) {
    url = fileServerBase(envFile(), envName()) + url;
  }
  url += "?timestamp=" + std::to_string(stamp) +
         "&sign=" + md5Hex(std::to_string(stamp) + "ronglian@2023!123");

  std::string targetDir = recvMonthDir(account, stamp);
  ensureDir(targetDir);
  std::string fileName = message.fileName.empty() ? fileNameOf(message.fileUrl)
                                                  : message.fileName;
  std::string target = availableFileName(targetDir, fileName);
  std::string sender = message.sender;
  std::string receiver = message.receiver;
  if (receiver.empty()) receiver = account;

  auto wait = std::make_shared<DownloadWait>();
  wait->msgId = message.msgId;
  wait->path = target;

  unsigned int matchKey = 0;
  int ret = DownloadFileMessageEX(&matchKey, sender.c_str(), receiver.c_str(),
                                  url.c_str(), target.c_str(),
                                  message.msgId.c_str(), (MsgType)message.msgType,
                                  const_cast<char*>(""), message.msgId.c_str());
  if (ret != 0) {
    result.error = "DownloadFileMessageEX 失败（" + std::to_string(ret) + "）";
    return result;
  }
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    pendingDownloads_[matchKey] = wait;
  }

  std::unique_lock<std::mutex> lk(wait->mutex);
  int timeout = waitMs > 0 ? waitMs : 5000;
  if (!wait->cv.wait_for(lk, std::chrono::milliseconds(timeout),
                         [&wait] { return wait->done; })) {
    result.pending = true;
    result.error = "下载已提交，等待完成回调";
    return result;
  }
  if (wait->reason != 0 && wait->reason != EC_Response_Success) {
    result.error = "下载失败（reason=" + std::to_string(wait->reason) + "）";
    return result;
  }
  result.ok = true;
  result.path = wait->path;
  return result;
#else
  (void)message;
  (void)account;
  (void)waitMs;
  result.error = unavailableReason_;
  return result;
#endif
}

void SdkHost::fetchGroups() {
#ifdef HYT_WITH_EC_SDK
  if (!available_ || !loggedIn()) return;
  std::thread([] {
    unsigned int matchKey = 0;
    int ret = QueryOwnGroup(&matchKey, "", 50, 125);
    if (ret != 0) logError("QueryOwnGroup 失败: %d", ret);
  }).detach();
#endif
}

std::vector<std::pair<std::string, std::string>> SdkHost::groups() {
  std::lock_guard<std::mutex> lk(groupsMutex_);
  if (!groupsLoaded_) loadGroupsLocked();
  std::vector<std::pair<std::string, std::string>> out;
  for (const auto& entry : groups_) out.push_back(entry.second);
  return out;
}

/**
 * 群名缓存由 SdkHost 自己写、自己读：插件只读本地库时拿不到在线群名，
 * 而 keepgroup 里通常只有退出群或客户端生成的默认名。
 */
void SdkHost::loadGroupsLocked() {
  groupsLoaded_ = true;
  std::string text;
  if (!readFile(joinPath(configDir(), "newhyt-groups.json"), &text)) return;
  nhjson::Value root;
  if (!nhjson::Value::parse(text, root)) return;
  const nhjson::Value* list = root.find("groups");
  if (list == nullptr || list->type != nhjson::Value::ARR) return;
  for (const auto& item : list->arr) {
    const std::string id = item.getString("groupId");
    if (id.empty()) continue;
    groups_[id] = {id, item.getString("name")};
  }
}

void SdkHost::persistGroups(
    const std::vector<std::pair<std::string, std::string>>& groups) {
  nhjson::Value list = nhjson::Value::array();
  for (const auto& group : groups) {
    if (group.first.empty()) continue;
    nhjson::Value item = nhjson::Value::object();
    item.set("groupId", nhjson::Value::string(group.first));
    item.set("name", nhjson::Value::string(group.second));
    list.arr.push_back(item);
  }
  nhjson::Value root = nhjson::Value::object();
  root.set("groups", list);
  ensureDir(configDir());
  const std::string path = joinPath(configDir(), "newhyt-groups.json");
  if (!writeFileAtomic(path, root.dump())) logError("写入群名缓存失败: %s", path.c_str());
}

bool SdkHost::loggedIn() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return loggedIn_;
}

bool SdkHost::connected() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return connected_;
}

std::string SdkHost::account() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return account_;
}

std::string SdkHost::comId() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return comId_;
}

int SdkHost::connectCode() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return connectCode_;
}

int SdkHost::connectReason() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return connectReason_;
}

std::string SdkHost::envName() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return env_;
}

std::string SdkHost::envFile() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return envFile_;
}

std::string SdkHost::sdkConfig() const {
  std::lock_guard<std::mutex> lk(stateMutex_);
  return sdkConfig_;
}

void SdkHost::handleConnectState(int code, int reason) {
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    connectCode_ = code;
    connectReason_ = reason;
    if (code == kConnectSuccess) {
      connected_ = true;
      loggedIn_ = true;
    } else if (code == kConnectFailed || code == kConnectKickOff ||
               code == kConnectForceLogOff) {
      connected_ = false;
      loggedIn_ = false;
    }
    stateCv_.notify_all();
  }

  nhjson::Value params = nhjson::Value::object();
  params.set("connected", nhjson::Value::boolean(code == kConnectSuccess));
  params.set("code", nhjson::Value::number(code));
  params.set("reason", nhjson::Value::number(reason));
  params.set("account", nhjson::Value::string(account()));
  emit("event.onConnectState", params);
  if (code == kConnectKickOff || code == kConnectForceLogOff) {
    // 客户端断开是用户能直接感知的故障，先落到 bridge.log，避免只能靠事件流回溯。
    logError("%s reason=%d account=%s",
             code == kConnectKickOff ? "同设备登录被踢" : "服务器强制下线", reason,
             account().c_str());
    emit("event.onKicked", params);
  }
  if (code == kConnectSuccess) fetchGroups();
}

void SdkHost::handleReceive(void* ecMessage, bool offline) {
#ifdef HYT_WITH_EC_SDK
  StoredMessage message = storedFromEc(static_cast<ECMessage*>(ecMessage));
  if (message.msgId.empty()) return;
  if (message.senderNick.empty()) message.senderNick = message.sender;

  emit("event.onMessage", messageToJson(message));

  // 插件自带桥接收到的消息也写进本地库，界面在客户端不开时也能看到；读取回执是通知类，不进聊天列表。
  if (message.msgType != Msg_Type_ReadNotify && message.msgType != kMsgTypeReadVoiceNotify) {
    writeMessage(message, true, false);
  }

  if (message.msgType == Msg_Type_ReadNotify || message.msgType == kMsgTypeReadVoiceNotify) {
    ECMessage* ec = static_cast<ECMessage*>(ecMessage);
    nhjson::Value receipt = nhjson::Value::object();
    receipt.set("msgId", nhjson::Value::string(message.msgId));
    receipt.set("sessionId", nhjson::Value::string(message.sessionId));
    // 回执通知本身是「读的人」发出来的，所以 sender 是读者，不是被读消息的发送人。
    receipt.set("account", nhjson::Value::string(message.sender));
    receipt.set("nick", nhjson::Value::string(message.senderNick));
    receipt.set("at", nhjson::Value::string(message.createdTime));
    receipt.set("voice", nhjson::Value::boolean(message.msgType == kMsgTypeReadVoiceNotify));
    // 被读消息 id：SDK 各版本分别放在 userDataMsgId、msgContent 与关联数组里，
    // 这里原样透出，由插件侧归一成 targetId，避免在桥接层猜格式。
    receipt.set("targetId", nhjson::Value::string(ec ? ecStr(ec->userDataMsgId) : ""));
    receipt.set("content", nhjson::Value::string(message.msg));
    receipt.set("userData", nhjson::Value::string(message.userData));
    nhjson::Value relate = nhjson::Value::array();
    if (ec && ec->relateArry) {
      for (int i = 0; i < ec->relateCount; ++i) {
        if (!ec->relateArry[i]) continue;
        relate.arr.push_back(nhjson::Value::string(ecStr(ec->relateArry[i])));
      }
    }
    receipt.set("relate", relate);
    emit("event.onReadReceipt", receipt);
  }
  if (offline) {
    nhjson::Value p = nhjson::Value::object();
    p.set("msgId", nhjson::Value::string(message.msgId));
    p.set("sessionId", nhjson::Value::string(message.sessionId));
    emit("event.onOfflineMessage", p);
  }
#else
  (void)ecMessage;
  (void)offline;
#endif
}

void SdkHost::handleSendTextResult(unsigned int matchKey, int reason, void* ecMessage) {
#ifdef HYT_WITH_EC_SDK
  PendingSend pending;
  bool hasPending = false;
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    auto it = pendingSends_.find(matchKey);
    if (it != pendingSends_.end()) {
      pending = it->second;
      pendingSends_.erase(it);
      hasPending = true;
    }
  }

  StoredMessage message = storedFromEc(static_cast<ECMessage*>(ecMessage));
  if (hasPending) {
    if (message.msg.empty()) message.msg = pending.text;
    if (message.userData.empty()) message.userData = pending.userData;
    if (message.sessionId.empty()) message.sessionId = pending.sessionId;
    if (message.receiver.empty()) message.receiver = pending.sessionId;
    message.sessionType = startsWith(pending.sessionId, "g") ? 1 : 0;
    message.chatType = message.sessionType;
  }
  if (message.sender.empty()) message.sender = account();
  if (message.senderNick.empty()) message.senderNick = message.sender;

  nhjson::Value result = nhjson::Value::object();
  result.set("ok", nhjson::Value::boolean(reason == EC_Response_Success));
  result.set("kind", nhjson::Value::string("text"));
  result.set("msgId", nhjson::Value::string(message.msgId));
  result.set("matchKey", nhjson::Value::number(matchKey));
  result.set("ret", nhjson::Value::number(reason));

  if (reason == EC_Response_Success && !message.msgId.empty()) {
    writeMessage(message, false, true);
  }
  emit("event.onSendResult", result);
#else
  (void)matchKey;
  (void)reason;
  (void)ecMessage;
#endif
}

void SdkHost::handleSendMediaResult(unsigned int matchKey, int reason, void* ecMessage) {
#ifdef HYT_WITH_EC_SDK
  PendingSend pending;
  bool hasPending = false;
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    auto it = pendingSends_.find(matchKey);
    if (it != pendingSends_.end()) {
      pending = it->second;
      pendingSends_.erase(it);
      hasPending = true;
    }
  }

  StoredMessage message = storedFromEc(static_cast<ECMessage*>(ecMessage));
  if (hasPending) {
    if (message.msgType == 0) message.msgType = pending.msgType;
    if (message.userData.empty()) message.userData = pending.userData;
    if (message.sessionId.empty()) message.sessionId = pending.sessionId;
    if (message.receiver.empty()) message.receiver = pending.sessionId;
    if (message.fileName.empty()) message.fileName = pending.displayName;
    if (message.fileName.empty()) message.fileName = fileNameOf(pending.filePath);
    message.fileFullPath = pending.filePath;
    if (message.fileSize == 0 && fileExists(pending.filePath)) {
      FILE* f = fopen(pending.filePath.c_str(), "rb");
      if (f) {
        fseek(f, 0, SEEK_END);
        message.fileSize = ftell(f);
        fclose(f);
      }
    }
    message.sessionType = startsWith(pending.sessionId, "g") ? 1 : 0;
    message.chatType = message.sessionType;
  }
  if (message.sender.empty()) message.sender = account();
  if (message.senderNick.empty()) message.senderNick = message.sender;

  nhjson::Value result = nhjson::Value::object();
  result.set("ok", nhjson::Value::boolean(reason == EC_Response_Success));
  result.set("kind", nhjson::Value::string(kindOf(message.msgType)));
  result.set("msgId", nhjson::Value::string(message.msgId));
  result.set("matchKey", nhjson::Value::number(matchKey));
  result.set("ret", nhjson::Value::number(reason));

  if (reason == EC_Response_Success && !message.msgId.empty()) {
    writeMessage(message, false, true);
  }
  emit("event.onSendResult", result);
#else
  (void)matchKey;
  (void)reason;
  (void)ecMessage;
#endif
}

void SdkHost::handleDownloadResult(unsigned int matchKey, int reason, void* ecMessage) {
#ifdef HYT_WITH_EC_SDK
  std::shared_ptr<DownloadWait> wait;
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    auto it = pendingDownloads_.find(matchKey);
    if (it != pendingDownloads_.end()) {
      wait = it->second;
      pendingDownloads_.erase(it);
    }
  }
  std::string msgId = wait ? wait->msgId : "";
  std::string path = wait ? wait->path : "";
  if (auto* msg = static_cast<ECMessage*>(ecMessage)) {
    if (msgId.empty()) msgId = ecStr(msg->msgId);
    if (path.empty()) path = ecStr(msg->fileName);
  }
  bool ok = reason == 0 || reason == EC_Response_Success;
  if (ok && !path.empty() && !msgId.empty() && storeUpdate_) {
    std::string error;
    if (!storeUpdate_(msgId, path, &error)) {
      nhjson::Value p = nhjson::Value::object();
      p.set("msgId", nhjson::Value::string(msgId));
      p.set("error", nhjson::Value::string(error));
      emit("event.onStoreError", p);
    }
  }

  nhjson::Value result = nhjson::Value::object();
  result.set("ok", nhjson::Value::boolean(ok));
  result.set("msgId", nhjson::Value::string(msgId));
  result.set("path", nhjson::Value::string(path));
  result.set("ret", nhjson::Value::number(reason));
  emit("event.onDownload", result);

  if (wait) {
    {
      std::lock_guard<std::mutex> lk(wait->mutex);
      wait->done = true;
      wait->reason = reason;
      if (!path.empty()) wait->path = path;
    }
    wait->cv.notify_all();
  }
#else
  (void)matchKey;
  (void)reason;
  (void)ecMessage;
#endif
}

void SdkHost::handleUploadProgress(unsigned int matchKey, unsigned long long uploaded,
                                   unsigned long long total, void* ecMessage) {
  (void)ecMessage;
  nhjson::Value params = nhjson::Value::object();
  params.set("matchKey", nhjson::Value::number(matchKey));
  params.set("uploaded", nhjson::Value::number((double)uploaded));
  params.set("total", nhjson::Value::number((double)total));
  emit("event.onUploadProgress", params);
}

void SdkHost::handleQueryMembers(unsigned int matchKey, int reason,
                                 std::vector<MemberInfo> members) {
  std::shared_ptr<MemberWait> wait;
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    auto it = pendingMembers_.find(matchKey);
    if (it != pendingMembers_.end()) {
      wait = it->second;
      pendingMembers_.erase(it);
    }
  }
  if (!wait) return;
  {
    std::lock_guard<std::mutex> lk(wait->mutex);
    wait->done = true;
    wait->reason = reason;
    wait->members = std::move(members);
  }
  wait->cv.notify_all();
}

void SdkHost::handleReadResult(unsigned int matchKey, int reason) {
  std::shared_ptr<ReadWait> wait;
  {
    std::lock_guard<std::mutex> lk(pendingMutex_);
    auto it = pendingReads_.find(matchKey);
    if (it != pendingReads_.end()) {
      wait = it->second;
      pendingReads_.erase(it);
    }
  }
  if (!wait) return;
  {
    std::lock_guard<std::mutex> lk(wait->mutex);
    wait->done = true;
    wait->reason = reason;
  }
  wait->cv.notify_all();
}

void SdkHost::handleOwnGroups(
    const std::vector<std::pair<std::string, std::string>>& groups) {
  std::vector<std::pair<std::string, std::string>> merged;
  {
    std::lock_guard<std::mutex> lk(groupsMutex_);
    for (const auto& group : groups) {
      if (group.first.empty()) continue;
      groups_[group.first] = group;
    }
    for (const auto& entry : groups_) merged.push_back(entry.second);
  }

  // 在线群名是唯一能拿到真实群名的来源，落盘后离线也能解析出来。
  persistGroups(merged);

  nhjson::Value list = nhjson::Value::array();
  for (const auto& group : merged) {
    nhjson::Value item = nhjson::Value::object();
    item.set("groupId", nhjson::Value::string(group.first));
    item.set("name", nhjson::Value::string(group.second));
    list.arr.push_back(item);
  }
  emit("event.onGroups", list);

#ifdef HYT_WITH_EC_SDK
  static std::atomic<int> pages{0};
  if (groups.size() >= 50 && pages.fetch_add(1) < 20 && !groups.empty()) {
    std::string border = groups.back().first;
    std::thread([border] {
      sleepMs(100);
      unsigned int matchKey = 0;
      int ret = QueryOwnGroup(&matchKey, border.c_str(), 50, 125);
      if (ret != 0) logError("QueryOwnGroup 续页失败: %d", ret);
    }).detach();
  }
#endif
}

void SdkHost::handleOfflineCount(int count) {
  nhjson::Value params = nhjson::Value::object();
  params.set("count", nhjson::Value::number(count));
  params.set("complete", nhjson::Value::boolean(false));
  emit("event.onOffline", params);
}

void SdkHost::handleOfflineComplete() {
  nhjson::Value params = nhjson::Value::object();
  params.set("complete", nhjson::Value::boolean(true));
  emit("event.onOffline", params);
}

void SdkHost::handleLogout(int reason) {
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    loggedIn_ = false;
    connected_ = false;
    connectCode_ = -1;
    connectReason_ = reason;
    stateCv_.notify_all();
  }
  nhjson::Value params = nhjson::Value::object();
  params.set("connected", nhjson::Value::boolean(false));
  params.set("code", nhjson::Value::number(-1));
  params.set("reason", nhjson::Value::number(reason));
  params.set("account", nhjson::Value::string(account()));
  emit("event.onConnectState", params);
}

void SdkHost::handleGroupNotice(const nhjson::Value& notice) {
  emit("event.onGroupNotice", notice);
}

void SdkHost::emit(const std::string& method, const nhjson::Value& params) {
  EventSink sink;
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    sink = sink_;
  }
  if (sink) sink(method, params);
}

void SdkHost::writeMessage(const StoredMessage& message, bool incoming, bool rebroadcast) {
  if (message.msgId.empty()) return;

  OwnMessage own;
  own.msgType = message.msgType;
  own.msgId = message.msgId;
  own.msg = message.msg;
  own.sender = message.sender;
  own.receiver = message.receiver;
  own.createdTime = message.createdTime;
  own.userData = message.userData;
  own.fileName = message.fileName;
  own.fileUrl = message.fileUrl;
  own.sessionType = message.sessionType;
  own.sessionId = message.sessionId;
  own.senderNick = message.senderNick;
  own.fileSize = message.fileSize;
  own.fileFullPath = message.fileFullPath;
  own.isAt = message.isAt;
  own.originFileSize = message.originFileSize;
  own.incoming = incoming;

  StoreWrite write;
  {
    std::lock_guard<std::mutex> lk(stateMutex_);
    write = storeWrite_;
  }
  if (!write) {
    logError("未注册 chatmsg 写入钩子，跳过 msgId=%s", message.msgId.c_str());
    return;
  }
  std::string error;
  if (!write(own, &error)) {
    nhjson::Value params = nhjson::Value::object();
    params.set("msgId", nhjson::Value::string(message.msgId));
    params.set("error", nhjson::Value::string(error));
    emit("event.onStoreError", params);
    return;
  }
  if (rebroadcast) broadcastSelfMessage(message);
}

void SdkHost::broadcastSelfMessage(const StoredMessage& message) {
  emit("event.onMessage", messageToJson(message));
}

}  // namespace hyt
