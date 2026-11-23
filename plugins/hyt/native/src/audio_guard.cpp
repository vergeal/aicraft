#include "audio_guard.hpp"

#ifdef _WIN32

#include <windows.h>
#include <mmdeviceapi.h>

#include <cstring>
#include <new>

#include "util.hpp"

namespace hyt {
namespace {

using CoCreateInstanceFn = HRESULT(WINAPI*)(REFCLSID, LPUNKNOWN, DWORD, REFIID, LPVOID*);

CoCreateInstanceFn gOriginalCreate = nullptr;
// 真实的枚举器。只有 SDK 需要播放设备时才创建并转发；录音设备根本不会走到它。
IMMDeviceEnumerator* gReal = nullptr;
bool gInstalled = false;

// WASAPI 的设备 ID 形如 {0.0.1.00000000}.{guid}（录音）和 {0.0.0.00000000}.{guid}（播放）。
// SDK 也可能拿配置里存下来的 ID 直接取设备，所以 GetDevice 也要认这个前缀。
bool isCaptureId(const wchar_t* id) {
  return id != nullptr && wcsncmp(id, L"{0.0.1.", 7) == 0;
}

// SDK 只接受一个「没有任何录音设备」的集合。
class EmptyCollection final : public IMMDeviceCollection {
 public:
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
    if (out == nullptr) return E_POINTER;
    if (IsEqualIID(riid, __uuidof(IUnknown)) || IsEqualIID(riid, __uuidof(IMMDeviceCollection))) {
      *out = this;
      AddRef();
      return S_OK;
    }
    *out = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refs_; }
  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG left = --refs_;
    if (left == 0) delete this;
    return left;
  }
  HRESULT STDMETHODCALLTYPE GetCount(UINT* count) override {
    if (count == nullptr) return E_POINTER;
    *count = 0;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Item(UINT, IMMDevice** device) override {
    if (device != nullptr) *device = nullptr;
    return E_NOTFOUND;
  }

 private:
  ULONG refs_ = 1;
};

// 除录音设备外全部转发给真实枚举器，播放设备与设备通知的行为保持原样。
class FilteredEnumerator final : public IMMDeviceEnumerator {
 public:
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
    if (out == nullptr) return E_POINTER;
    if (IsEqualIID(riid, __uuidof(IUnknown)) || IsEqualIID(riid, __uuidof(IMMDeviceEnumerator))) {
      *out = this;
      AddRef();
      return S_OK;
    }
    *out = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refs_; }
  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG left = --refs_;
    if (left == 0) delete this;
    return left;
  }
  HRESULT STDMETHODCALLTYPE EnumAudioEndpoints(EDataFlow flow, DWORD mask,
                                               IMMDeviceCollection** out) override {
    if (out == nullptr) return E_POINTER;
    if (flow == eCapture) {
      *out = new (std::nothrow) EmptyCollection();
      return *out == nullptr ? E_OUTOFMEMORY : S_OK;
    }
    return gReal->EnumAudioEndpoints(flow, mask, out);
  }
  HRESULT STDMETHODCALLTYPE GetDefaultAudioEndpoint(EDataFlow flow, ERole role,
                                                    IMMDevice** out) override {
    if (out == nullptr) return E_POINTER;
    if (flow == eCapture) {
      *out = nullptr;
      return E_NOTFOUND;
    }
    return gReal->GetDefaultAudioEndpoint(flow, role, out);
  }
  HRESULT STDMETHODCALLTYPE GetDevice(LPCWSTR id, IMMDevice** out) override {
    if (out == nullptr) return E_POINTER;
    if (isCaptureId(id)) {
      *out = nullptr;
      return E_NOTFOUND;
    }
    return gReal->GetDevice(id, out);
  }
  HRESULT STDMETHODCALLTYPE RegisterEndpointNotificationCallback(IMMNotificationClient* client) override {
    return gReal->RegisterEndpointNotificationCallback(client);
  }
  HRESULT STDMETHODCALLTYPE UnregisterEndpointNotificationCallback(IMMNotificationClient* client) override {
    return gReal->UnregisterEndpointNotificationCallback(client);
  }

 private:
  ULONG refs_ = 1;
};

HRESULT WINAPI hookedCreateInstance(REFCLSID clsid, LPUNKNOWN outer, DWORD context, REFIID iid,
                                    LPVOID* out) {
  if (gOriginalCreate == nullptr || !IsEqualCLSID(clsid, __uuidof(MMDeviceEnumerator))) {
    return gOriginalCreate(clsid, outer, context, iid, out);
  }
  if (out == nullptr) return E_POINTER;
  if (gReal == nullptr) {
    IMMDeviceEnumerator* created = nullptr;
    const HRESULT hr = gOriginalCreate(clsid, outer, context, __uuidof(IMMDeviceEnumerator),
                                       reinterpret_cast<LPVOID*>(&created));
    if (FAILED(hr)) return hr;
    if (created == nullptr) return E_NOINTERFACE;
    gReal = created;
  }
  auto* filtered = new (std::nothrow) FilteredEnumerator();
  if (filtered == nullptr) return E_OUTOFMEMORY;
  const HRESULT hr = filtered->QueryInterface(iid, out);
  filtered->Release();
  return hr;
}

// 只改指定模块导入表里的一个函数指针，返回被替换掉的原始地址。
void* patchImport(HMODULE module, const char* dll, const char* name, void* replacement) {
  auto* base = reinterpret_cast<BYTE*>(module);
  auto* dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
  if (dos->e_magic != IMAGE_DOS_SIGNATURE) return nullptr;
  auto* headers = reinterpret_cast<IMAGE_NT_HEADERS*>(base + dos->e_lfanew);
  if (headers->Signature != IMAGE_NT_SIGNATURE) return nullptr;
  const auto& directory = headers->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
  if (directory.VirtualAddress == 0) return nullptr;

  auto* descriptor = reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base + directory.VirtualAddress);
  for (; descriptor->Name != 0; ++descriptor) {
    if (_stricmp(reinterpret_cast<const char*>(base + descriptor->Name), dll) != 0) continue;
    const DWORD namesRva = descriptor->OriginalFirstThunk != 0 ? descriptor->OriginalFirstThunk : descriptor->FirstThunk;
    auto* names = reinterpret_cast<IMAGE_THUNK_DATA*>(base + namesRva);
    auto* iat = reinterpret_cast<IMAGE_THUNK_DATA*>(base + descriptor->FirstThunk);
    for (; names->u1.AddressOfData != 0; ++names, ++iat) {
      if (IMAGE_SNAP_BY_ORDINAL(names->u1.Ordinal)) continue;
      auto* imported = reinterpret_cast<IMAGE_IMPORT_BY_NAME*>(base + names->u1.AddressOfData);
      if (strcmp(reinterpret_cast<const char*>(imported->Name), name) != 0) continue;
      void* original = reinterpret_cast<void*>(iat->u1.Function);
      DWORD old = 0;
      if (VirtualProtect(iat, sizeof(void*), PAGE_READWRITE, &old) == FALSE) return nullptr;
      iat->u1.Function = reinterpret_cast<ULONG_PTR>(replacement);
      VirtualProtect(iat, sizeof(void*), old, &old);
      return original;
    }
    return nullptr;
  }
  return nullptr;
}

}  // namespace

void suppressMicrophoneAccess() {
  if (gInstalled) return;
  gInstalled = true;

  // 媒体层可能还没被 SDK 加载，导入表就还不存在；先加载它，SDK 之后用的是同一个模块。
  HMODULE media = LoadLibraryW(L"Ecmedia.dll");
  if (media == nullptr) {
    logInfo("屏蔽录音设备：未找到 Ecmedia.dll，跳过");
    return;
  }
  gOriginalCreate = reinterpret_cast<CoCreateInstanceFn>(
      patchImport(media, "ole32.dll", "CoCreateInstance", reinterpret_cast<void*>(&hookedCreateInstance)));
  if (gOriginalCreate == nullptr) {
    logInfo("屏蔽录音设备：Ecmedia.dll 导入表里没有 CoCreateInstance，跳过");
    return;
  }
  // ECsdk.dll 也会用 CoCreateInstance 创建别的 COM 对象，这里只拦枚举器，其余照常转发。
  HMODULE sdk = GetModuleHandleW(L"ECsdk.dll");
  if (sdk != nullptr) {
    patchImport(sdk, "ole32.dll", "CoCreateInstance", reinterpret_cast<void*>(&hookedCreateInstance));
  }
  logInfo("已屏蔽 EC SDK 的录音设备枚举");
}

}  // namespace hyt

#else

namespace hyt {
void suppressMicrophoneAccess() {}
}  // namespace hyt

#endif  // _WIN32
