// 让 EC SDK 看不到录音设备。
//
// 虹云通 SDK 的媒体层（Ecmedia.dll）在初始化与登录时用 WASAPI 枚举录音设备，
// 即使插件只收发文字消息，安全软件也会把这些调用当成「正在使用麦克风」并反复提示。
// SDK 没有关闭媒体层的接口，所以这里只替换 Ecmedia.dll / ECsdk.dll 导入表里的
// ole32!CoCreateInstance：拿到 IMMDeviceEnumerator 时换成一层过滤包装，录音设备
// 一律当作不存在。改动只在当前进程内生效，不动系统设置，也不影响收发消息。
#pragma once

namespace hyt {

// 必须在 ECSDK_Initialize 之前调用；重复调用无副作用。
void suppressMicrophoneAccess();

}  // namespace hyt
