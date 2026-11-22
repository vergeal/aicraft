// 极简 JSON（无第三方依赖），仅满足 newhyt 桥接协议的解析与序列化。
#pragma once
#include <string>
#include <vector>
#include <map>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace nhjson {

struct Value {
  enum Type { NUL, BOOL, NUM, STR, ARR, OBJ } type = NUL;
  bool b = false;
  double num = 0;
  std::string str;
  std::vector<Value> arr;
  std::map<std::string, Value> obj;

  Value() {}
  static Value boolean(bool v) { Value x; x.type = BOOL; x.b = v; return x; }
  static Value number(double v) { Value x; x.type = NUM; x.num = v; return x; }
  static Value string(const std::string& v) { Value x; x.type = STR; x.str = v; return x; }
  static Value object() { Value x; x.type = OBJ; return x; }
  static Value array() { Value x; x.type = ARR; return x; }

  const Value* find(const std::string& k) const {
    if (type != OBJ) return nullptr;
    auto it = obj.find(k);
    return it == obj.end() ? nullptr : &it->second;
  }
  std::string getString(const std::string& k, const std::string& d = "") const {
    const Value* v = find(k);
    return (v && v->type == STR) ? v->str : d;
  }
  double getNumber(const std::string& k, double d = 0) const {
    const Value* v = find(k);
    return (v && v->type == NUM) ? v->num : d;
  }
  long long getInt(const std::string& k, long long d = 0) const {
    const Value* v = find(k);
    if (!v) return d;
    if (v->type == NUM) return (long long)v->num;
    if (v->type == STR) return strtoll(v->str.c_str(), nullptr, 10);
    return d;
  }
  bool getBool(const std::string& k, bool d = false) const {
    const Value* v = find(k);
    if (!v) return d;
    if (v->type == BOOL) return v->b;
    if (v->type == NUM) return v->num != 0;
    if (v->type == STR) return v->str == "1" || v->str == "true";
    return d;
  }
  bool has(const std::string& k) const { return find(k) != nullptr; }
  Value& set(const std::string& k, const Value& v) {
    type = OBJ;
    obj[k] = v;
    return *this;
  }

  std::string dump() const {
    std::string out;
    dumpTo(out);
    return out;
  }

 private:
  void dumpTo(std::string& out) const {
    switch (type) {
      case NUL: out += "null"; break;
      case BOOL: out += b ? "true" : "false"; break;
      case NUM: {
        char buf[64];
        if (num == (long long)num) snprintf(buf, sizeof(buf), "%lld", (long long)num);
        else snprintf(buf, sizeof(buf), "%.6f", num);
        out += buf;
        break;
      }
      case STR: escape(str, out); break;
      case ARR: {
        out += '[';
        for (size_t i = 0; i < arr.size(); ++i) { if (i) out += ','; arr[i].dumpTo(out); }
        out += ']';
        break;
      }
      case OBJ: {
        out += '{';
        bool first = true;
        for (auto& kv : obj) {
          if (!first) out += ',';
          first = false;
          escape(kv.first, out);
          out += ':';
          kv.second.dumpTo(out);
        }
        out += '}';
        break;
      }
    }
  }
  static void escape(const std::string& s, std::string& out) {
    out += '"';
    for (char c : s) {
      switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
          if ((unsigned char)c < 0x20) { char buf[8]; snprintf(buf, sizeof(buf), "\\u%04x", c); out += buf; }
          else out += c;
      }
    }
    out += '"';
  }

 public:
  static bool parse(const std::string& s, Value& out) {
    size_t i = 0;
    return parseValue(s, i, out);
  }

 private:
  static void skipWs(const std::string& s, size_t& i) {
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
  }
  static bool parseValue(const std::string& s, size_t& i, Value& out) {
    skipWs(s, i);
    if (i >= s.size()) return false;
    char c = s[i];
    if (c == '{') return parseObject(s, i, out);
    if (c == '[') return parseArray(s, i, out);
    if (c == '"') { out.type = STR; return parseString(s, i, out.str); }
    if (c == 't' || c == 'f') return parseBool(s, i, out);
    if (c == 'n') { i += 4; out.type = NUL; return true; }
    return parseNumber(s, i, out);
  }
  static bool parseObject(const std::string& s, size_t& i, Value& out) {
    out = object();
    i++;  // {
    skipWs(s, i);
    if (i < s.size() && s[i] == '}') { i++; return true; }
    while (i < s.size()) {
      skipWs(s, i);
      std::string key;
      if (!parseString(s, i, key)) return false;
      skipWs(s, i);
      if (i >= s.size() || s[i] != ':') return false;
      i++;
      Value v;
      if (!parseValue(s, i, v)) return false;
      out.obj[key] = v;
      skipWs(s, i);
      if (i < s.size() && s[i] == ',') { i++; continue; }
      if (i < s.size() && s[i] == '}') { i++; return true; }
      return false;
    }
    return false;
  }
  static bool parseArray(const std::string& s, size_t& i, Value& out) {
    out = array();
    i++;  // [
    skipWs(s, i);
    if (i < s.size() && s[i] == ']') { i++; return true; }
    while (i < s.size()) {
      Value v;
      if (!parseValue(s, i, v)) return false;
      out.arr.push_back(v);
      skipWs(s, i);
      if (i < s.size() && s[i] == ',') { i++; continue; }
      if (i < s.size() && s[i] == ']') { i++; return true; }
      return false;
    }
    return false;
  }
  static bool parseString(const std::string& s, size_t& i, std::string& out) {
    if (i >= s.size() || s[i] != '"') return false;
    i++;
    out.clear();
    while (i < s.size()) {
      char c = s[i++];
      if (c == '"') return true;
      if (c == '\\' && i < s.size()) {
        char e = s[i++];
        switch (e) {
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case '/': out += '/'; break;
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case 'u': {
            if (i + 4 <= s.size()) {
              int code = (int)strtol(s.substr(i, 4).c_str(), nullptr, 16);
              i += 4;
              // 仅处理 BMP 的 UTF-8 编码
              if (code < 0x80) out += (char)code;
              else if (code < 0x800) { out += (char)(0xC0 | (code >> 6)); out += (char)(0x80 | (code & 0x3F)); }
              else { out += (char)(0xE0 | (code >> 12)); out += (char)(0x80 | ((code >> 6) & 0x3F)); out += (char)(0x80 | (code & 0x3F)); }
            }
            break;
          }
          default: out += e;
        }
      } else {
        out += c;
      }
    }
    return false;
  }
  static bool parseBool(const std::string& s, size_t& i, Value& out) {
    if (s.compare(i, 4, "true") == 0) { i += 4; out = boolean(true); return true; }
    if (s.compare(i, 5, "false") == 0) { i += 5; out = boolean(false); return true; }
    return false;
  }
  static bool parseNumber(const std::string& s, size_t& i, Value& out) {
    size_t start = i;
    while (i < s.size() && (isdigit((unsigned char)s[i]) || s[i] == '-' || s[i] == '+' || s[i] == '.' ||
                            s[i] == 'e' || s[i] == 'E')) {
      i++;
    }
    if (i == start) return false;
    out = number(strtod(s.substr(start, i - start).c_str(), nullptr));
    return true;
  }
};

}  // namespace nhjson
