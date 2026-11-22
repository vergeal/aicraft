// 通用工具：日志、路径、时间、字符串、Base64、AES、HTTP。
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace hyt {

// ------------------------------- 日志 -------------------------------
enum LogLevel { LOG_ERROR = 0, LOG_INFO = 1, LOG_DEBUG = 2 };

void logSetLevel(int level);
void logSetFile(const std::string& path);
void logWrite(int level, const char* fmt, ...);
void logInfo(const char* fmt, ...);
void logDebug(const char* fmt, ...);
void logError(const char* fmt, ...);

// ------------------------------- 时间 -------------------------------
long long nowMs();
std::string monthStamp(long long ms);
std::string logTime();

// ------------------------------ 字符串 ------------------------------
std::string trim(const std::string& s);
bool startsWith(const std::string& s, const std::string& prefix);
bool endsWith(const std::string& s, const std::string& suffix);
std::string toLower(const std::string& s);
std::vector<std::string> split(const std::string& s, char sep);
std::string joinPath(const std::string& a, const std::string& b);
std::string toNumberString(double v);
bool parseServerTime(const std::string& text, long long* out);

// ------------------------------ 文件系统 ----------------------------
std::string homeDir();
std::string chRootDir();
std::string configDir();
std::string accountDir(const std::string& account);
std::string recvMonthDir(const std::string& account, long long ms);
std::string dbPath(const std::string& account);
bool ensureDir(const std::string& path);
bool fileExists(const std::string& path);
bool readFile(const std::string& path, std::string* out);
bool writeFileAtomic(const std::string& path, const std::string& data);
std::string fileNameOf(const std::string& path);
std::string availableFileName(const std::string& dir, const std::string& name);
std::string uniqueSuffix();

// ------------------------------ Base64 ------------------------------
std::string base64Encode(const std::string& data);
bool base64Decode(const std::string& text, std::string* out);

// ------------------------------- MD5 --------------------------------
std::string md5Hex(const std::string& data);

// --------------------------- AES-128-CBC/PKCS7 ----------------------
// 与客户端 AESTool::AesEncryptPadding5 对齐：key 16 字节、IV 全 0、PKCS5/7、
// 输出 Base64。
std::string aesEncryptBase64(const std::string& plain, const std::string& key,
                             const std::string& iv);

// -------------------------------- HTTP ------------------------------
struct HttpResult {
  bool ok = false;
  long status = 0;
  std::string body;
  std::string error;
};

HttpResult httpPostJson(const std::string& url, const std::string& body,
                        int timeoutSeconds);

// ------------------------------- 休眠 -------------------------------
void sleepMs(int ms);

}  // namespace hyt
