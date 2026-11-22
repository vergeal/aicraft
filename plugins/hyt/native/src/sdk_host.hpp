// EC SDK 宿主：生命周期、登录、收发、成员查询、下载与事件回调。
//
// 未链接 EC SDK 的平台（例如缺少 .so 的 Linux）编译为 stub：所有方法返回
// 明确的不可用错误，进程仍可启动并提供本地历史/会话查询。
#pragma once

#include <condition_variable>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "json.hpp"
#include "store.hpp"

namespace hyt {

struct LoginOptions {
  std::string userName;
  std::string password;
  std::string appId;
  std::string appToken;
  std::string comId;
  std::string env = "prod";       // prod | test
  std::string envFile;            // rxSettings ini，可选
  std::string sdkConfig;          // sdk_server_config*.xml，可选
  std::string pbsBase;            // 覆盖 PBS 地址，可选
  int mode = 1;                   // LoginEx2 mode：1 用户输入，2 自动登录
  int waitMs = 5000;              // 等待连接状态的时间
};

struct LoginResult {
  bool ok = false;
  bool pending = false;
  std::string account;
  std::string message;
  int ret = 0;
  int connectCode = -1;
  int reason = 0;
};

struct SendRequest {
  std::string sessionId;
  std::string text;
  std::string userData;
  std::string extOpts;
  std::string filePath;
  std::string displayName;
  int msgType = 1;
  int rotate = 0;
  bool isAt = false;
};

struct SendResult {
  bool ok = false;
  std::string msgId;
  int ret = 0;
  std::string error;
};

struct MemberInfo {
  std::string account;
  std::string name;
  int role = 0;
  int sex = 0;
};

struct MemberResult {
  bool ok = false;
  std::string error;
  std::vector<MemberInfo> members;
};

struct DownloadResult {
  bool ok = false;
  bool pending = false;
  std::string path;
  std::string msgId;
  std::string error;
};

using EventSink = std::function<void(const std::string&, const nhjson::Value&)>;
using StoreWrite = std::function<bool(const OwnMessage&, std::string*)>;
using StoreLookup = std::function<bool(const std::string&, StoredMessage*)>;
using StoreUpdate =
    std::function<bool(const std::string&, const std::string&, std::string*)>;

class SdkHost {
 public:
  static SdkHost& instance();

  void setSink(EventSink sink);
  void setStoreHooks(StoreWrite write, StoreLookup lookup, StoreUpdate update);

  bool available() const { return available_; }
  const std::string& unavailableReason() const { return unavailableReason_; }
  void initialize();

  LoginResult login(const LoginOptions& options);
  bool logout(std::string* error);
  SendResult sendText(const SendRequest& request);
  SendResult sendMedia(const SendRequest& request);
  MemberResult queryMembers(const std::string& groupId, int waitMs);
  DownloadResult download(const StoredMessage& message, const std::string& account,
                          int waitMs);
  void fetchGroups();
  std::vector<std::pair<std::string, std::string>> groups();

  bool loggedIn() const;
  bool connected() const;
  std::string account() const;
  std::string comId() const;
  int connectCode() const;
  int connectReason() const;
  std::string envName() const;
  std::string envFile() const;
  std::string sdkConfig() const;

  // 供 C 回调转发（SDK 线程）。
  void handleConnectState(int code, int reason);
  void handleReceive(void* ecMessage, bool offline);
  void handleSendTextResult(unsigned int matchKey, int reason, void* ecMessage);
  void handleSendMediaResult(unsigned int matchKey, int reason, void* ecMessage);
  void handleDownloadResult(unsigned int matchKey, int reason, void* ecMessage);
  void handleUploadProgress(unsigned int matchKey, unsigned long long uploaded,
                            unsigned long long total, void* ecMessage);
  void handleQueryMembers(unsigned int matchKey, int reason,
                          std::vector<MemberInfo> members);
  void handleOwnGroups(const std::vector<std::pair<std::string, std::string>>& groups);
  void handleGroupNotice(const nhjson::Value& notice);
  void handleOfflineCount(int count);
  void handleOfflineComplete();
  void handleLogout(int reason);

 private:
  SdkHost() = default;
  void emit(const std::string& method, const nhjson::Value& params);
  void setConnectState(int code, int reason);
  void writeOwnMessage(const StoredMessage& message, bool fromSendCallback);
  void broadcastSelfMessage(const StoredMessage& message);

  struct PendingSend {
    std::string sessionId;
    std::string text;
    std::string userData;
    std::string filePath;
    std::string displayName;
    int msgType = 1;
    bool isAt = false;
    bool media = false;
  };

  struct MemberWait {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    int reason = 0;
    std::vector<MemberInfo> members;
  };

  struct DownloadWait {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    int reason = 0;
    std::string msgId;
    std::string path;
  };

  mutable std::mutex stateMutex_;
  std::condition_variable stateCv_;
  std::mutex callMutex_;
  std::mutex pendingMutex_;
  std::mutex groupsMutex_;

  bool initialized_ = false;
  bool available_ = false;
  std::string unavailableReason_;
  bool loggedIn_ = false;
  bool connected_ = false;
  int connectCode_ = -1;
  int connectReason_ = 0;
  std::string account_;
  std::string comId_;
  std::string env_ = "prod";
  std::string envFile_;
  std::string sdkConfig_;

  EventSink sink_;
  StoreWrite storeWrite_;
  StoreLookup storeLookup_;
  StoreUpdate storeUpdate_;

  std::map<unsigned int, PendingSend> pendingSends_;
  std::map<unsigned int, std::shared_ptr<MemberWait>> pendingMembers_;
  std::map<unsigned int, std::shared_ptr<DownloadWait>> pendingDownloads_;
  std::map<std::string, std::pair<std::string, std::string>> groups_;
};

}  // namespace hyt
