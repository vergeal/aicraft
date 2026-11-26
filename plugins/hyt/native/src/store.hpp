// 本地 chatmsg.db 的读写（与虹云通客户端同库同表）。
#pragma once

#include <mutex>
#include <string>
#include <vector>

struct sqlite3;

namespace hyt {

struct StoredMessage {
  long long id = 0;
  int msgType = 0;
  std::string msgId;
  std::string msg;
  std::string sender;
  std::string receiver;
  std::string createdTime;
  std::string userData;
  std::string fileName;
  std::string fileUrl;
  int sessionType = 0;
  std::string sessionId;
  std::string senderNick;
  long long fileSize = 0;
  std::string fileFullPath;
  int chatType = 0;
  int isAt = 0;
  int readStatus = 0;
  int isSuccess = 0;
  int operationType = 0;
  long long originFileSize = 0;
};

struct SessionSummary {
  StoredMessage last;
  long long unread = 0;
  std::string groupName;
};

struct GroupRow {
  std::string groupId;
  std::string name;
  std::string avatar;
};

struct OwnMessage {
  int msgType = 0;
  std::string msgId;
  std::string msg;
  std::string sender;
  std::string receiver;
  std::string createdTime;
  std::string userData;
  std::string fileName;
  std::string fileUrl;
  int sessionType = 0;
  std::string sessionId;
  std::string senderNick;
  long long fileSize = 0;
  std::string fileFullPath;
  int isAt = 0;
  long long originFileSize = 0;
  /** true 表示收到的消息：未读、本地时间取服务端时间、lastmsg 未读数 +1。 */
  bool incoming = false;
};

class Store {
 public:
  explicit Store(std::string account);
  ~Store();

  bool open();
  bool available() const { return db_ != nullptr; }
  const std::string& file() const { return file_; }
  const std::string& error() const { return error_; }

  std::vector<StoredMessage> history(const std::string& sessionId,
                                     const std::string& beforeId, int limit,
                                     bool* hasMore);
  bool findMessage(const std::string& msgIdOrId, StoredMessage* out);
  std::vector<SessionSummary> sessions(int limit);
  std::vector<GroupRow> groups();
  bool groupName(const std::string& groupId, std::string* name);

  bool insertOwnMessage(const OwnMessage& msg, std::string* error);
  bool updateFileFullPath(const std::string& msgId, const std::string& path,
                          std::string* error);
  /** 撤回落地：把原消息行就地改成撤回通知（MsgType 25），与官方客户端一致。命中才返回 true。 */
  bool markRecalled(const std::string& msgId, std::string* error);

 private:
  bool execSimple(const std::string& sql, std::string* error);
  bool beginWrite(std::string* error);
  void rollback();

  std::string account_;
  std::string file_;
  std::string error_;
  sqlite3* db_ = nullptr;
  std::mutex mutex_;
};

}  // namespace hyt
