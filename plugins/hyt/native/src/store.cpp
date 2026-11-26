#include "store.hpp"

#include <sqlite3.h>

#include "util.hpp"

namespace hyt {
namespace {

const char* kColumns =
    "Id,MsgType,MsgId,Msg,Sender,Receiver,CreatedTime,UserData,FileName,FileUrl,"
    "SessionType,SessionId,SenderNick,FileSize,FileFullPath,ChatType,isAt,"
    "ReadStatus,isSuccess,operationType,originFileSize";

// sessions 的 JOIN 里 Id 等列会歧义，用带表别名的版本。
const char* kColumnsAliased =
    "m.Id,m.MsgType,m.MsgId,m.Msg,m.Sender,m.Receiver,m.CreatedTime,m.UserData,"
    "m.FileName,m.FileUrl,m.SessionType,m.SessionId,m.SenderNick,m.FileSize,"
    "m.FileFullPath,m.ChatType,m.isAt,m.ReadStatus,m.isSuccess,m.operationType,"
    "m.originFileSize";

std::string text(sqlite3_stmt* stmt, int index) {
  const unsigned char* v = sqlite3_column_text(stmt, index);
  return v ? reinterpret_cast<const char*>(v) : "";
}

long long number(sqlite3_stmt* stmt, int index) {
  return (long long)sqlite3_column_int64(stmt, index);
}

StoredMessage readMessage(sqlite3_stmt* stmt, int base) {
  StoredMessage m;
  m.id = number(stmt, base + 0);
  m.msgType = (int)number(stmt, base + 1);
  m.msgId = text(stmt, base + 2);
  m.msg = text(stmt, base + 3);
  m.sender = text(stmt, base + 4);
  m.receiver = text(stmt, base + 5);
  m.createdTime = text(stmt, base + 6);
  m.userData = text(stmt, base + 7);
  m.fileName = text(stmt, base + 8);
  m.fileUrl = text(stmt, base + 9);
  m.sessionType = (int)number(stmt, base + 10);
  m.sessionId = text(stmt, base + 11);
  m.senderNick = text(stmt, base + 12);
  m.fileSize = number(stmt, base + 13);
  m.fileFullPath = text(stmt, base + 14);
  m.chatType = (int)number(stmt, base + 15);
  m.isAt = (int)number(stmt, base + 16);
  m.readStatus = (int)number(stmt, base + 17);
  m.isSuccess = (int)number(stmt, base + 18);
  m.operationType = (int)number(stmt, base + 19);
  m.originFileSize = number(stmt, base + 20);
  return m;
}

}  // namespace

Store::Store(std::string account) : account_(std::move(account)) {
  file_ = dbPath(account_);
}

Store::~Store() {
  if (db_) sqlite3_close(db_);
}

bool Store::execSimple(const std::string& sql, std::string* error) {
  char* msg = nullptr;
  int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &msg);
  if (rc != SQLITE_OK) {
    if (error) *error = msg ? msg : sqlite3_errmsg(db_);
    if (msg) sqlite3_free(msg);
    return false;
  }
  if (msg) sqlite3_free(msg);
  return true;
}

bool Store::open() {
  std::lock_guard<std::mutex> lk(mutex_);
  if (db_) return true;
  if (!ensureDir(accountDir(account_))) {
    error_ = "无法创建账号目录: " + accountDir(account_);
    return false;
  }
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX;
  int rc = sqlite3_open_v2(file_.c_str(), &db_, flags, nullptr);
  if (rc != SQLITE_OK) {
    error_ = std::string("打开 chatmsg.db 失败: ") +
             (db_ ? sqlite3_errmsg(db_) : sqlite3_errstr(rc));
    if (db_) {
      sqlite3_close(db_);
      db_ = nullptr;
    }
    return false;
  }
  sqlite3_busy_timeout(db_, 3000);
  return true;
}

std::vector<StoredMessage> Store::history(const std::string& sessionId,
                                          const std::string& beforeId, int limit,
                                          bool* hasMore) {
  if (hasMore) *hasMore = false;
  std::vector<StoredMessage> out;
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_ || sessionId.empty()) return out;
  if (limit <= 0) limit = 20;
  if (limit > 200) limit = 200;

  std::string sql = std::string("SELECT ") + kColumns +
                    " FROM chatmsg WHERE SessionId=?";
  bool hasBefore = false;
  for (char c : beforeId) {
    if (!isdigit((unsigned char)c)) {
      hasBefore = false;
      break;
    }
    hasBefore = true;
  }
  if (hasBefore) sql += " AND Id<?";
  sql += " ORDER BY Id DESC LIMIT ?";

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) return out;
  sqlite3_bind_text(stmt, 1, sessionId.c_str(), -1, SQLITE_TRANSIENT);
  int idx = 2;
  if (hasBefore) {
    sqlite3_bind_int64(stmt, idx++, strtoll(beforeId.c_str(), nullptr, 10));
  }
  sqlite3_bind_int(stmt, idx, limit + 1);

  int count = 0;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    if (count == limit) {
      if (hasMore) *hasMore = true;
      break;
    }
    out.push_back(readMessage(stmt, 0));
    ++count;
  }
  sqlite3_finalize(stmt);
  return out;
}

bool Store::findMessage(const std::string& msgIdOrId, StoredMessage* out) {
  if (msgIdOrId.empty()) return false;
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) return false;
  std::string sql = std::string("SELECT ") + kColumns +
                    " FROM chatmsg WHERE MsgId=? OR CAST(Id AS TEXT)=? LIMIT 1";
  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) return false;
  sqlite3_bind_text(stmt, 1, msgIdOrId.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, msgIdOrId.c_str(), -1, SQLITE_TRANSIENT);
  bool found = sqlite3_step(stmt) == SQLITE_ROW;
  if (found && out) *out = readMessage(stmt, 0);
  sqlite3_finalize(stmt);
  return found;
}

std::vector<SessionSummary> Store::sessions(int limit) {
  std::vector<SessionSummary> out;
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) return out;
  if (limit <= 0) limit = 50;
  if (limit > 200) limit = 200;

  std::string sql =
      std::string("SELECT ") + kColumnsAliased +
      ",IFNULL(l.UnReadCount,0),IFNULL(k.GroupName,'') FROM chatmsg m "
      "JOIN (SELECT SessionId AS sid,MAX(Id) AS mid FROM chatmsg "
      "      WHERE SessionId IS NOT NULL AND SessionId<>'' GROUP BY SessionId) x "
      "  ON m.Id=x.mid "
      "LEFT JOIN lastmsg l ON l.SessionId=m.SessionId "
      "LEFT JOIN keepgroup k ON k.GroupId=m.SessionId "
      "ORDER BY m.Id DESC LIMIT ?";

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) return out;
  sqlite3_bind_int(stmt, 1, limit);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    SessionSummary s;
    s.last = readMessage(stmt, 0);
    s.unread = number(stmt, 21);
    s.groupName = text(stmt, 22);
    out.push_back(s);
  }
  sqlite3_finalize(stmt);
  return out;
}

std::vector<GroupRow> Store::groups() {
  std::vector<GroupRow> out;
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) return out;
  sqlite3_stmt* stmt = nullptr;
  const char* sql =
      "SELECT IFNULL(GroupId,''),IFNULL(GroupName,''),IFNULL(GroupHeadUrl,'') "
      "FROM keepgroup WHERE GroupId IS NOT NULL AND GroupId<>'' ORDER BY Id";
  if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return out;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    GroupRow g;
    g.groupId = text(stmt, 0);
    g.name = text(stmt, 1);
    g.avatar = text(stmt, 2);
    out.push_back(g);
  }
  sqlite3_finalize(stmt);
  return out;
}

bool Store::groupName(const std::string& groupId, std::string* name) {
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) return false;
  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_, "SELECT IFNULL(GroupName,'') FROM keepgroup WHERE GroupId=? LIMIT 1",
                         -1, &stmt, nullptr) != SQLITE_OK) {
    return false;
  }
  sqlite3_bind_text(stmt, 1, groupId.c_str(), -1, SQLITE_TRANSIENT);
  bool found = sqlite3_step(stmt) == SQLITE_ROW;
  if (found && name) *name = text(stmt, 0);
  sqlite3_finalize(stmt);
  return found;
}

bool Store::beginWrite(std::string* error) {
  return execSimple("BEGIN IMMEDIATE", error);
}

void Store::rollback() { sqlite3_exec(db_, "ROLLBACK", nullptr, nullptr, nullptr); }

bool Store::insertOwnMessage(const OwnMessage& m, std::string* error) {
  if (m.msgId.empty()) {
    if (error) *error = "msgId 为空";
    return false;
  }
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) {
    if (error) *error = "chatmsg.db 未打开";
    return false;
  }

  const char* sql =
      "INSERT OR IGNORE INTO chatmsg ("
      "MsgType,MsgId,Msg,Sender,Receiver,CreatedTime,UserData,FileName,FileUrl,"
      "SessionType,LocalTime,SessionId,SenderNick,ReadStatus,FileSize,FileFullPath,"
      "ChatType,isAt,operationType,isSave,isOfflinePush,isHint,isSyncMsg,"
      "isReceiveOfflineMsg,originFileSize,isSuccess)"
      " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  std::string lastError;
  for (int attempt = 0; attempt < 3; ++attempt) {
    if (!beginWrite(&lastError)) {
      if (lastError.find("locked") == std::string::npos &&
          lastError.find("busy") == std::string::npos) {
        break;
      }
      sleepMs(50 * (attempt + 1));
      continue;
    }
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
      lastError = sqlite3_errmsg(db_);
      rollback();
      break;
    }
    int i = 1;
    sqlite3_bind_int(stmt, i++, m.msgType);
    sqlite3_bind_text(stmt, i++, m.msgId.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.msg.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.sender.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.receiver.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.createdTime.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.userData.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.fileName.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.fileUrl.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, i++, m.sessionType);
    if (m.incoming)
      sqlite3_bind_text(stmt, i++, m.createdTime.c_str(), -1, SQLITE_TRANSIENT);
    else
      sqlite3_bind_int64(stmt, i++, 0);
    sqlite3_bind_text(stmt, i++, m.sessionId.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, i++, m.senderNick.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, i++, m.incoming ? 0 : 1);
    sqlite3_bind_int64(stmt, i++, m.fileSize);
    sqlite3_bind_text(stmt, i++, m.fileFullPath.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, i++, m.sessionType);
    sqlite3_bind_int(stmt, i++, m.isAt);
    sqlite3_bind_int(stmt, i++, 0);
    sqlite3_bind_int(stmt, i++, 1);
    sqlite3_bind_int(stmt, i++, 1);
    sqlite3_bind_int(stmt, i++, 0);
    sqlite3_bind_int(stmt, i++, 1);
    sqlite3_bind_int(stmt, i++, 0);
    sqlite3_bind_int64(stmt, i++, m.originFileSize);
    sqlite3_bind_int(stmt, i++, 1);

    int rc = sqlite3_step(stmt);
    // 这条消息是本进程第一次写进库，才累加未读；客户端同时写入时由它自己维护计数，避免双计。
    const bool inserted = rc == SQLITE_DONE && sqlite3_changes(db_) > 0;
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) {
      lastError = sqlite3_errmsg(db_);
      rollback();
      if (lastError.find("locked") == std::string::npos &&
          lastError.find("busy") == std::string::npos) {
        break;
      }
      sleepMs(50 * (attempt + 1));
      continue;
    }

    if (!m.sessionId.empty()) {
      char* err = nullptr;
      // sessionId 来自会话标识，仍转义单引号以免破坏 SQL。
      std::string escaped;
      for (char c : m.sessionId) {
        escaped += c;
        if (c == '\'') escaped += '\'';
      }
      std::string insertLast =
          m.incoming && inserted
              ? "INSERT INTO lastmsg (SessionId,UnReadCount) VALUES ('" + escaped +
                    "',1) ON CONFLICT(SessionId) DO UPDATE SET UnReadCount = IFNULL(UnReadCount,0)+1"
              : "INSERT OR IGNORE INTO lastmsg (SessionId,UnReadCount) VALUES ('" +
                    escaped + "',0)";
      if (sqlite3_exec(db_, insertLast.c_str(), nullptr, nullptr, &err) != SQLITE_OK) {
        logError("lastmsg 写入失败: %s", err ? err : "unknown");
      }
      if (err) sqlite3_free(err);
    }

    if (!execSimple("COMMIT", &lastError)) {
      rollback();
      break;
    }
    if (error) error->clear();
    logDebug("已写入 chatmsg: msgId=%s session=%s", m.msgId.c_str(),
             m.sessionId.c_str());
    return true;
  }

  if (error) *error = lastError.empty() ? "写入 chatmsg 失败" : lastError;
  logError("写入 chatmsg 失败 msgId=%s: %s", m.msgId.c_str(),
           error ? error->c_str() : lastError.c_str());
  return false;
}

bool Store::updateFileFullPath(const std::string& msgId, const std::string& path,
                               std::string* error) {
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) {
    if (error) *error = "chatmsg.db 未打开";
    return false;
  }
  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_, "UPDATE chatmsg SET FileFullPath=? WHERE MsgId=?",
                         -1, &stmt, nullptr) != SQLITE_OK) {
    if (error) *error = sqlite3_errmsg(db_);
    return false;
  }
  sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, msgId.c_str(), -1, SQLITE_TRANSIENT);
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    if (error) *error = sqlite3_errmsg(db_);
    return false;
  }
  return true;
}

bool Store::markRecalled(const std::string& msgId, std::string* error) {
  std::lock_guard<std::mutex> lk(mutex_);
  if (!db_) {
    if (error) *error = "chatmsg.db 未打开";
    return false;
  }
  sqlite3_stmt* stmt = nullptr;
  // 官方客户端收到撤回通知不会插新行，而是把原消息行就地改成 MsgType 25，
  // 正文换成「你撤回了一条消息」（库里已有的官方样本就是这个形状）。
  // 原文必须清掉，否则搜索与预览还看得到撤回前的内容。
  const char* sql =
      "UPDATE chatmsg SET MsgType=25, Msg='你撤回了一条消息', ReadStatus=1 "
      "WHERE MsgId=? AND MsgType<>25";
  if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) {
    if (error) *error = sqlite3_errmsg(db_);
    return false;
  }
  sqlite3_bind_text(stmt, 1, msgId.c_str(), -1, SQLITE_TRANSIENT);
  int rc = sqlite3_step(stmt);
  int changes = sqlite3_changes(db_);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    if (error) *error = sqlite3_errmsg(db_);
    return false;
  }
  return changes > 0;
}

}  // namespace hyt
