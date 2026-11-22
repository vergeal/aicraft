#include "util.hpp"

#include <algorithm>
#include <cctype>
#include <cerrno>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <mutex>
#include <sstream>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#include <io.h>
#include <windows.h>
#include <winhttp.h>
#else
#include <dirent.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>
#ifdef HYT_WITH_CURL
#include <curl/curl.h>
#endif
#endif

namespace hyt {

// ------------------------------- 日志 -------------------------------
static int gLogLevel = LOG_INFO;
static std::string gLogFile;
static std::mutex gLogMutex;

void logSetLevel(int level) { gLogLevel = level; }

void logSetFile(const std::string& path) {
  std::lock_guard<std::mutex> lk(gLogMutex);
  gLogFile = path;
}

void logWrite(int level, const char* fmt, ...) {
  if (level > gLogLevel) return;
  char msg[4096];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof(msg), fmt, ap);
  va_end(ap);

  const char* tag = level == LOG_ERROR ? "ERR" : (level == LOG_DEBUG ? "DBG" : "INF");
  std::string line = logTime() + " [" + tag + "] " + msg + "\n";

  std::lock_guard<std::mutex> lk(gLogMutex);
  fwrite(line.data(), 1, line.size(), stdout);
  fflush(stdout);
  if (!gLogFile.empty()) {
    FILE* f = fopen(gLogFile.c_str(), "ab");
    if (f) {
      fwrite(line.data(), 1, line.size(), f);
      fclose(f);
    }
  }
}

void logInfo(const char* fmt, ...) {
  if (LOG_INFO > gLogLevel) return;
  char msg[4096];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof(msg), fmt, ap);
  va_end(ap);
  logWrite(LOG_INFO, "%s", msg);
}

void logDebug(const char* fmt, ...) {
  if (LOG_DEBUG > gLogLevel) return;
  char msg[4096];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof(msg), fmt, ap);
  va_end(ap);
  logWrite(LOG_DEBUG, "%s", msg);
}

void logError(const char* fmt, ...) {
  char msg[4096];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof(msg), fmt, ap);
  va_end(ap);
  logWrite(LOG_ERROR, "%s", msg);
}

// ------------------------------- 时间 -------------------------------
long long nowMs() {
  auto now = std::chrono::system_clock::now();
  return std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch())
      .count();
}

std::string monthStamp(long long ms) {
  time_t seconds = (time_t)(ms / 1000);
  struct tm tmv;
#ifdef _WIN32
  localtime_s(&tmv, &seconds);
#else
  localtime_r(&seconds, &tmv);
#endif
  char buf[16];
  snprintf(buf, sizeof(buf), "%04d%02d", tmv.tm_year + 1900, tmv.tm_mon + 1);
  return buf;
}

std::string logTime() {
  time_t seconds = (time_t)(nowMs() / 1000);
  struct tm tmv;
#ifdef _WIN32
  localtime_s(&tmv, &seconds);
#else
  localtime_r(&seconds, &tmv);
#endif
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d", tmv.tm_year + 1900,
           tmv.tm_mon + 1, tmv.tm_mday, tmv.tm_hour, tmv.tm_min, tmv.tm_sec);
  return buf;
}

// ------------------------------ 字符串 ------------------------------
std::string trim(const std::string& s) {
  size_t b = 0;
  size_t e = s.size();
  while (b < e && isspace((unsigned char)s[b])) b++;
  while (e > b && isspace((unsigned char)s[e - 1])) e--;
  return s.substr(b, e - b);
}

bool startsWith(const std::string& s, const std::string& prefix) {
  return s.size() >= prefix.size() && s.compare(0, prefix.size(), prefix) == 0;
}

bool endsWith(const std::string& s, const std::string& suffix) {
  return s.size() >= suffix.size() &&
         s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

std::string toLower(const std::string& s) {
  std::string out = s;
  for (auto& c : out) c = (char)tolower((unsigned char)c);
  return out;
}

std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::string cur;
  for (char c : s) {
    if (c == sep) {
      out.push_back(cur);
      cur.clear();
    } else {
      cur += c;
    }
  }
  out.push_back(cur);
  return out;
}

std::string joinPath(const std::string& a, const std::string& b) {
  if (a.empty()) return b;
  char last = a[a.size() - 1];
  if (last == '/' || last == '\\') return a + b;
  return a + "/" + b;
}

std::string toNumberString(double v) {
  char buf[64];
  if (v == (double)(long long)v) {
    snprintf(buf, sizeof(buf), "%lld", (long long)v);
  } else {
    snprintf(buf, sizeof(buf), "%.0f", v);
  }
  return buf;
}

bool parseServerTime(const std::string& text, long long* out) {
  std::string s = trim(text);
  if (s.empty()) return false;
  for (char c : s) {
    if (!isdigit((unsigned char)c)) return false;
  }
  if (s.size() > 18) return false;
  *out = strtoll(s.c_str(), nullptr, 10);
  return *out > 0;
}

// ------------------------------ 文件系统 ----------------------------
static bool mkdirOne(const std::string& path) {
#ifdef _WIN32
  return _mkdir(path.c_str()) == 0 || errno == EEXIST;
#else
  return mkdir(path.c_str(), 0755) == 0 || errno == EEXIST;
#endif
}

bool ensureDir(const std::string& path) {
  if (path.empty()) return false;
  std::string cur;
  size_t i = 0;
  if (path[0] == '/' || (path.size() > 1 && path[1] == ':')) {
    cur = path.substr(0, 2);
    i = 2;
  }
  for (; i <= path.size(); ++i) {
    if (i == path.size() || path[i] == '/' || path[i] == '\\') {
      if (!cur.empty() && !mkdirOne(cur)) return false;
      if (i < path.size()) cur += path[i];
    } else {
      cur += path[i];
    }
  }
  return true;
}

bool fileExists(const std::string& path) {
  struct stat st;
  return stat(path.c_str(), &st) == 0 && (st.st_mode & S_IFMT) == S_IFREG;
}

bool readFile(const std::string& path, std::string* out) {
  FILE* f = fopen(path.c_str(), "rb");
  if (!f) return false;
  char buf[8192];
  out->clear();
  while (true) {
    size_t n = fread(buf, 1, sizeof(buf), f);
    if (n == 0) break;
    out->append(buf, n);
  }
  fclose(f);
  return true;
}

bool writeFileAtomic(const std::string& path, const std::string& data) {
  std::string tmp = path + ".tmp";
  FILE* f = fopen(tmp.c_str(), "wb");
  if (!f) return false;
  size_t written = fwrite(data.data(), 1, data.size(), f);
  fflush(f);
  fclose(f);
  if (written != data.size()) return false;
#ifdef _WIN32
  _unlink(path.c_str());
  return rename(tmp.c_str(), path.c_str()) == 0;
#else
  return rename(tmp.c_str(), path.c_str()) == 0;
#endif
}

std::string fileNameOf(const std::string& path) {
  size_t pos = path.find_last_of("/\\");
  if (pos == std::string::npos) return path;
  return path.substr(pos + 1);
}

std::string uniqueSuffix() {
  static std::mutex m;
  static int seq = 0;
  std::lock_guard<std::mutex> lk(m);
  char buf[32];
  snprintf(buf, sizeof(buf), "%lld_%d", nowMs(), ++seq);
  return buf;
}

std::string availableFileName(const std::string& dir, const std::string& name) {
  std::string base = joinPath(dir, name);
  if (!fileExists(base)) return base;
  std::string stem = name;
  std::string ext;
  size_t dot = name.find_last_of('.');
  if (dot != std::string::npos && dot > 0) {
    stem = name.substr(0, dot);
    ext = name.substr(dot);
  }
  for (int i = 1; i < 1000; ++i) {
    std::string candidate =
        joinPath(dir, stem + " (" + std::to_string(i) + ")" + ext);
    if (!fileExists(candidate)) return candidate;
  }
  return joinPath(dir, stem + "_" + uniqueSuffix() + ext);
}

std::string homeDir() {
#ifdef _WIN32
  const char* h = getenv("USERPROFILE");
  return h ? h : ".";
#else
  const char* h = getenv("HOME");
  return h ? h : ".";
#endif
}

std::string chRootDir() {
  if (const char* env = getenv("HYT_CH_ROOT")) {
    if (*env) return env;
  }
  return joinPath(joinPath(homeDir(), "Documents"), "CHFile");
}

std::string configDir() { return joinPath(chRootDir(), "Config"); }

std::string accountDir(const std::string& account) {
  return joinPath(chRootDir(), account);
}

std::string recvMonthDir(const std::string& account, long long ms) {
  return joinPath(joinPath(accountDir(account), "RecvFiles"), monthStamp(ms));
}

std::string dbPath(const std::string& account) {
  return joinPath(accountDir(account), "chatmsg.db");
}

// ------------------------------ Base64 ------------------------------
static const char kB64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string base64Encode(const std::string& data) {
  std::string out;
  out.reserve((data.size() + 2) / 3 * 4);
  size_t i = 0;
  while (i + 2 < data.size()) {
    unsigned v = ((unsigned char)data[i] << 16) | ((unsigned char)data[i + 1] << 8) |
                 (unsigned char)data[i + 2];
    out += kB64[(v >> 18) & 63];
    out += kB64[(v >> 12) & 63];
    out += kB64[(v >> 6) & 63];
    out += kB64[v & 63];
    i += 3;
  }
  if (i + 1 == data.size()) {
    unsigned v = (unsigned char)data[i] << 16;
    out += kB64[(v >> 18) & 63];
    out += kB64[(v >> 12) & 63];
    out += "==";
  } else if (i + 2 == data.size()) {
    unsigned v = ((unsigned char)data[i] << 16) | ((unsigned char)data[i + 1] << 8);
    out += kB64[(v >> 18) & 63];
    out += kB64[(v >> 12) & 63];
    out += kB64[(v >> 6) & 63];
    out += "=";
  }
  return out;
}

bool base64Decode(const std::string& text, std::string* out) {
  int rev[256];
  for (int i = 0; i < 256; ++i) rev[i] = -1;
  for (int i = 0; i < 64; ++i) rev[(unsigned char)kB64[i]] = i;
  out->clear();
  unsigned buffer = 0;
  int bits = 0;
  for (char c : text) {
    if (c == '=' || isspace((unsigned char)c)) continue;
    int v = rev[(unsigned char)c];
    if (v < 0) return false;
    buffer = (buffer << 6) | (unsigned)v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out->push_back((char)((buffer >> bits) & 0xFF));
    }
  }
  return true;
}

// --------------------------- AES-128-CBC/PKCS7 ----------------------
namespace {

const uint8_t kSbox[256] = {
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe,
    0xd7, 0xab, 0x76, 0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4,
    0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7,
    0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15, 0x04, 0xc7, 0x23, 0xc3,
    0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75, 0x09,
    0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3,
    0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe,
    0x39, 0x4a, 0x4c, 0x58, 0xcf, 0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85,
    0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92,
    0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2, 0xcd, 0x0c,
    0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19,
    0x73, 0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14,
    0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2,
    0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5,
    0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08, 0xba, 0x78, 0x25,
    0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86,
    0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e,
    0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf, 0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42,
    0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16};

const uint8_t kRcon[11] = {0x00, 0x01, 0x02, 0x04, 0x08, 0x10,
                           0x20, 0x40, 0x80, 0x1b, 0x36};

uint8_t xtime(uint8_t x) { return (uint8_t)((x << 1) ^ (((x >> 7) & 1) * 0x1b)); }

void aesExpandKey(const uint8_t key[16], uint8_t rk[176]) {
  memcpy(rk, key, 16);
  for (int i = 16; i < 176; i += 4) {
    uint8_t t[4] = {rk[i - 4], rk[i - 3], rk[i - 2], rk[i - 1]};
    if (i % 16 == 0) {
      uint8_t tmp = t[0];
      t[0] = kSbox[t[1]];
      t[1] = kSbox[t[2]];
      t[2] = kSbox[t[3]];
      t[3] = kSbox[tmp];
      t[0] ^= kRcon[i / 16];
    }
    for (int j = 0; j < 4; ++j) rk[i + j] = rk[i - 16 + j] ^ t[j];
  }
}

void aesEncryptBlock(const uint8_t in[16], const uint8_t rk[176], uint8_t out[16]) {
  uint8_t s[16];
  memcpy(s, in, 16);
  for (int i = 0; i < 16; ++i) s[i] ^= rk[i];
  for (int round = 1; round <= 10; ++round) {
    uint8_t t[16];
    // SubBytes + ShiftRows
    t[0] = kSbox[s[0]];
    t[1] = kSbox[s[5]];
    t[2] = kSbox[s[10]];
    t[3] = kSbox[s[15]];
    t[4] = kSbox[s[4]];
    t[5] = kSbox[s[9]];
    t[6] = kSbox[s[14]];
    t[7] = kSbox[s[3]];
    t[8] = kSbox[s[8]];
    t[9] = kSbox[s[13]];
    t[10] = kSbox[s[2]];
    t[11] = kSbox[s[7]];
    t[12] = kSbox[s[12]];
    t[13] = kSbox[s[1]];
    t[14] = kSbox[s[6]];
    t[15] = kSbox[s[11]];
    if (round != 10) {
      for (int c = 0; c < 4; ++c) {
        uint8_t* p = t + c * 4;
        uint8_t a0 = p[0], a1 = p[1], a2 = p[2], a3 = p[3];
        p[0] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
        p[1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
        p[2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
        p[3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
      }
    }
    for (int i = 0; i < 16; ++i) s[i] = t[i] ^ rk[round * 16 + i];
  }
  memcpy(out, s, 16);
}

}  // namespace

std::string aesEncryptBase64(const std::string& plain, const std::string& key,
                             const std::string& iv) {
  uint8_t k[16] = {0};
  uint8_t ivb[16] = {0};
  memcpy(k, key.data(), std::min<size_t>(key.size(), 16));
  memcpy(ivb, iv.data(), std::min<size_t>(iv.size(), 16));

  std::string data = plain;
  size_t pad = 16 - (data.size() % 16);
  data.append(pad, (char)pad);

  uint8_t rk[176];
  aesExpandKey(k, rk);

  std::string out(data.size(), '\0');
  uint8_t prev[16];
  memcpy(prev, ivb, 16);
  for (size_t off = 0; off < data.size(); off += 16) {
    uint8_t block[16];
    for (int i = 0; i < 16; ++i) block[i] = (uint8_t)data[off + i] ^ prev[i];
    aesEncryptBlock(block, rk, prev);
    memcpy(&out[off], prev, 16);
  }
  return base64Encode(out);
}

// -------------------------------- HTTP ------------------------------
#ifdef _WIN32
static std::wstring toWide(const std::string& s) {
  int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
  std::wstring out(len, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], len);
  return out;
}

static void splitUrl(const std::string& url, std::wstring* host, std::wstring* path,
                     int* port, bool* https) {
  std::string rest = url;
  *https = false;
  if (startsWith(rest, "https://")) {
    *https = true;
    rest = rest.substr(8);
  } else if (startsWith(rest, "http://")) {
    rest = rest.substr(7);
  }
  size_t slash = rest.find('/');
  std::string hostPort = slash == std::string::npos ? rest : rest.substr(0, slash);
  std::string p = slash == std::string::npos ? "/" : rest.substr(slash);
  size_t colon = hostPort.find(':');
  std::string hostName = colon == std::string::npos ? hostPort : hostPort.substr(0, colon);
  *port = colon == std::string::npos ? (*https ? 443 : 80)
                                     : atoi(hostPort.substr(colon + 1).c_str());
  *host = toWide(hostName);
  *path = toWide(p);
}

HttpResult httpPostJson(const std::string& url, const std::string& body,
                        int timeoutSeconds) {
  HttpResult result;
  std::wstring host, path;
  int port = 0;
  bool https = false;
  splitUrl(url, &host, &path, &port, &https);

  HINTERNET session = WinHttpOpen(L"hyt-bridge/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                  WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) {
    result.error = "WinHttpOpen failed";
    return result;
  }
  WinHttpSetTimeouts(session, timeoutSeconds * 1000, timeoutSeconds * 1000,
                     timeoutSeconds * 1000, timeoutSeconds * 1000);
  HINTERNET connect = WinHttpConnect(session, host.c_str(), (INTERNET_PORT)port, 0);
  if (!connect) {
    result.error = "WinHttpConnect failed";
    WinHttpCloseHandle(session);
    return result;
  }
  HINTERNET request = WinHttpOpenRequest(
      connect, L"POST", path.c_str(), nullptr, WINHTTP_NO_REFERER,
      WINHTTP_DEFAULT_ACCEPT_TYPES, https ? WINHTTP_FLAG_SECURE : 0);
  if (!request) {
    result.error = "WinHttpOpenRequest failed";
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return result;
  }
  std::wstring headers = L"Content-Type: application/json;charset=utf-8\r\n";
  BOOL sent = WinHttpSendRequest(request, headers.c_str(), (DWORD)-1L,
                                 (LPVOID)body.data(), (DWORD)body.size(),
                                 (DWORD)body.size(), 0);
  if (sent) sent = WinHttpReceiveResponse(request, nullptr);
  if (!sent) {
    result.error = "winhttp request failed: " + std::to_string(GetLastError());
  } else {
    DWORD status = 0;
    DWORD size = sizeof(status);
    WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &size,
                        WINHTTP_NO_HEADER_INDEX);
    result.status = (long)status;
    DWORD avail = 0;
    do {
      avail = 0;
      if (!WinHttpQueryDataAvailable(request, &avail)) break;
      if (avail == 0) break;
      std::string chunk(avail, '\0');
      DWORD read = 0;
      if (!WinHttpReadData(request, &chunk[0], avail, &read)) break;
      chunk.resize(read);
      result.body += chunk;
    } while (avail > 0);
    result.ok = result.status >= 200 && result.status < 300;
  }
  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);
  return result;
}
#else
HttpResult httpPostJson(const std::string& url, const std::string& body,
                        int timeoutSeconds) {
  HttpResult result;
#ifdef HYT_WITH_CURL
  CURL* curl = curl_easy_init();
  if (!curl) {
    result.error = "curl_easy_init failed";
    return result;
  }
  struct curl_slist* headers = nullptr;
  headers = curl_slist_append(headers, "Content-Type: application/json;charset=utf-8");
  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_POST, 1L);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
  curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body.size());
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, (long)timeoutSeconds);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, (long)std::min(timeoutSeconds, 5));
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION,
                   +[](char* ptr, size_t size, size_t nmemb, void* userdata) -> size_t {
                     auto* out = static_cast<std::string*>(userdata);
                     out->append(ptr, size * nmemb);
                     return size * nmemb;
                   });
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &result.body);
  CURLcode code = curl_easy_perform(curl);
  if (code == CURLE_OK) {
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &result.status);
    result.ok = result.status >= 200 && result.status < 300;
  } else {
    result.error = curl_easy_strerror(code);
  }
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
#else
  (void)url;
  (void)body;
  (void)timeoutSeconds;
  result.error =
      "HTTP 客户端未编译（需要 libcurl）。可通过 auth.login 的 appId/appToken 直接登录绕过 PBS。";
#endif
  return result;
}
#endif

// -------------------------------- MD5 -------------------------------
namespace {

inline uint32_t rotl32(uint32_t x, int n) { return (x << n) | (x >> (32 - n)); }

const uint32_t kMd5Shift[64] = {
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21};

const uint32_t kMd5Table[64] = {
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391};

void md5Block(uint32_t state[4], const unsigned char* block) {
  uint32_t w[16];
  for (int i = 0; i < 16; ++i) {
    w[i] = (uint32_t)block[i * 4] | ((uint32_t)block[i * 4 + 1] << 8) |
           ((uint32_t)block[i * 4 + 2] << 16) |
           ((uint32_t)block[i * 4 + 3] << 24);
  }
  uint32_t a = state[0], b = state[1], c = state[2], d = state[3];
  for (int i = 0; i < 64; ++i) {
    uint32_t f;
    int g;
    if (i < 16) {
      f = (b & c) | (~b & d);
      g = i;
    } else if (i < 32) {
      f = (d & b) | (~d & c);
      g = (5 * i + 1) % 16;
    } else if (i < 48) {
      f = b ^ c ^ d;
      g = (3 * i + 5) % 16;
    } else {
      f = c ^ (b | ~d);
      g = (7 * i) % 16;
    }
    uint32_t tmp = d;
    d = c;
    c = b;
    b = b + rotl32(a + f + kMd5Table[i] + w[g], (int)kMd5Shift[i]);
    a = tmp;
  }
  state[0] += a;
  state[1] += b;
  state[2] += c;
  state[3] += d;
}

}  // namespace

std::string md5Hex(const std::string& data) {
  uint32_t state[4] = {0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476};
  std::string msg = data;
  uint64_t bits = (uint64_t)data.size() * 8;
  msg.push_back((char)0x80);
  while (msg.size() % 64 != 56) msg.push_back('\0');
  for (int i = 0; i < 8; ++i) msg.push_back((char)((bits >> (8 * i)) & 0xff));

  for (size_t off = 0; off < msg.size(); off += 64) {
    md5Block(state, (const unsigned char*)msg.data() + off);
  }

  char out[33];
  for (int i = 0; i < 4; ++i) {
    for (int j = 0; j < 4; ++j) {
      snprintf(out + i * 8 + j * 2, 3, "%02x",
               (unsigned)((state[i] >> (8 * j)) & 0xff));
    }
  }
  out[32] = '\0';
  return out;
}

// ------------------------------- 休眠 -------------------------------
void sleepMs(int ms) {
#ifdef _WIN32
  Sleep((DWORD)ms);
#else
  usleep((useconds_t)ms * 1000);
#endif
}

}  // namespace hyt
