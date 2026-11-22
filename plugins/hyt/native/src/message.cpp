#include "message.hpp"

#include "util.hpp"

namespace hyt {
using nhjson::Value;

std::string kindOf(int msgType) {
  switch (msgType) {
    case 1:
    case 11:
      return "text";
    case 2:
      return "voice";
    case 3:
      return "video";
    case 4:
      return "image";
    case 6:
    case 7:
      return "file";
    case 25:
      return "recall";
    case 101:
      return "call";
    case 150:
      return "notice";
    case 245:
      return "merge";
    case 246:
      return "notice";
    default:
      return "other";
  }
}

void parseAt(const std::string& userData, std::vector<AtEntry>* at, bool* isAt) {
  if (isAt) *isAt = false;
  if (userData.empty() || userData.find("\"at\"") == std::string::npos) return;
  Value root;
  if (!Value::parse(userData, root)) return;
  const Value* arr = root.find("at");
  if (!arr || arr->type != Value::ARR) return;
  for (const auto& item : arr->arr) {
    AtEntry e;
    e.account = item.getString("account");
    e.name = item.getString("name");
    if (!e.account.empty()) at->push_back(e);
  }
  if (isAt) *isAt = !at->empty();
}

static std::string fileExt(const std::string& name) {
  size_t dot = name.find_last_of('.');
  if (dot == std::string::npos || dot + 1 >= name.size()) return "";
  return toLower(name.substr(dot + 1));
}

std::string mergeTitle(const StoredMessage& m) {
  if (!m.userData.empty()) {
    Value ud;
    if (Value::parse(m.userData, ud)) {
      std::string title = ud.getString("title");
      if (!title.empty()) return title;
    }
  }
  return m.fileName.empty() ? m.msg : m.fileName;
}

static std::string mergeText(const StoredMessage& m) {
  if (!m.userData.empty()) {
    Value ud;
    if (Value::parse(m.userData, ud)) {
      std::string title = ud.getString("title");
      if (!title.empty()) return title;
      std::string desc = ud.getString("msgDesc");
      if (!desc.empty()) return desc;
    }
  }
  return m.msg;
}

Value messageToJson(const StoredMessage& m) {
  Value out = Value::object();
  out.set("id", Value::string(m.id > 0 ? std::to_string(m.id) : m.msgId));
  out.set("msgId", Value::string(m.msgId));
  const std::string kind = kindOf(m.msgType);
  out.set("kind", Value::string(kind));

  std::string text = m.msg;
  if (kind == "merge") text = mergeText(m);
  out.set("text", Value::string(text));

  out.set("sessionId", Value::string(m.sessionId));
  out.set("chatType", Value::number(m.sessionType));

  long long createdAt = 0;
  if (!parseServerTime(m.createdTime, &createdAt)) createdAt = 0;
  out.set("createdAt", Value::number((double)createdAt));
  out.set("localTime", Value::number(0));

  Value sender = Value::object();
  sender.set("account", Value::string(m.sender));
  sender.set("name", Value::string(m.senderNick));
  out.set("sender", sender);

  std::vector<AtEntry> at;
  bool isAt = false;
  parseAt(m.userData, &at, &isAt);
  out.set("isAt", Value::boolean(isAt || m.isAt != 0));
  Value atArr = Value::array();
  for (const auto& e : at) {
    Value item = Value::object();
    item.set("account", Value::string(e.account));
    item.set("name", Value::string(e.name));
    atArr.arr.push_back(item);
  }
  out.set("at", atArr);

  if (kind == "image" || kind == "file" || kind == "voice" || kind == "video" ||
      !m.fileName.empty() || !m.fileUrl.empty()) {
    Value file = Value::object();
    file.set("name", Value::string(m.fileName));
    file.set("size", Value::number((double)m.fileSize));
    file.set("url", Value::string(m.fileUrl));
    file.set("localPath", Value::string(m.fileFullPath));
    file.set("ext", Value::string(fileExt(m.fileName)));
    out.set("file", file);
  }

  if (kind == "merge") {
    Value merge = Value::object();
    merge.set("title", Value::string(mergeTitle(m)));
    out.set("merge", merge);
  }

  Value raw = Value::object();
  raw.set("msgType", Value::number(m.msgType));
  raw.set("userData", Value::string(m.userData));
  out.set("raw", raw);
  return out;
}

static std::string entryKind(int type) { return kindOf(type); }

bool parseMergeEntries(const std::string& fileContent,
                       std::vector<Value>* entries, std::string* error) {
  std::string trimmed = trim(fileContent);
  std::string decoded;
  if (startsWith(trimmed, "[")) {
    decoded = trimmed;
  } else if (!base64Decode(trimmed, &decoded)) {
    if (error) *error = "合并转发文件不是有效的 base64";
    return false;
  }
  Value root;
  if (!Value::parse(decoded, root) || root.type != Value::ARR) {
    if (error) *error = "合并转发内容不是 JSON 数组";
    return false;
  }
  for (const auto& item : root.arr) {
    int type = (int)item.getInt("merge_type", -1);
    Value e = Value::object();
    e.set("type", Value::number(type));
    e.set("kind", Value::string(entryKind(type)));
    e.set("account", Value::string(item.getString("merge_account")));
    e.set("msgId", Value::string(item.getString("merge_messageId")));
    e.set("time", Value::number((double)item.getInt("merge_time", 0)));
    e.set("userData", Value::string(item.getString("merge_userData")));
    std::string content = item.getString("merge_content");
    if (content.empty()) content = item.getString("merge_title");
    e.set("text", Value::string(content));
    std::string localPath = item.getString("merge_fileLocalPath");
    if (localPath.empty()) localPath = item.getString("merge_local_url");
    std::string url = item.getString("merge_url");
    std::string title = item.getString("merge_title");
    if (!url.empty() || !localPath.empty() || type == 4 || type == 3 || type == 6 ||
        type == 7) {
      Value file = Value::object();
      file.set("name", Value::string(title));
      file.set("size", Value::number((double)item.getInt("merge_fileSize", 0)));
      file.set("url", Value::string(url));
      file.set("localPath", Value::string(localPath));
      file.set("ext", Value::string(fileExt(title)));
      e.set("file", file);
    }
    entries->push_back(e);
  }
  return true;
}

}  // namespace hyt
