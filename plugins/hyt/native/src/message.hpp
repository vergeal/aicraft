// 消息规范化：ECMessage / chatmsg 行 → 统一 JSON 载荷。
#pragma once

#include <string>
#include <vector>

#include "json.hpp"
#include "store.hpp"

namespace hyt {

struct AtEntry {
  std::string account;
  std::string name;
};

std::string kindOf(int msgType);
void parseAt(const std::string& userData, std::vector<AtEntry>* at, bool* isAt);

// 统一消息载荷（event.onMessage / im.history / im.sessions）。
nhjson::Value messageToJson(const StoredMessage& m);

// merge 消息的标题（优先 UserData.title）。
std::string mergeTitle(const StoredMessage& m);

// 解析合并转发 txt（内容为 base64(JSON 数组)）。
bool parseMergeEntries(const std::string& fileContent,
                       std::vector<nhjson::Value>* entries, std::string* error);

}  // namespace hyt
