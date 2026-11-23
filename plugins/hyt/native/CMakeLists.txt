cmake_minimum_required(VERSION 3.20)
project(hyt-native-bridge CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# EC SDK 根目录：形如 native/sdk（含 include/<platform> 与 lib/<platform>）。
# 未提供或对应平台库缺失时编译 stub，进程仍可启动并读本地历史。
set(HYT_SDK_ROOT "" CACHE PATH "EC SDK 根目录（包含 include/ 与 lib/）")
if(NOT HYT_SDK_ROOT AND DEFINED ENV{HYT_SDK_ROOT})
  set(HYT_SDK_ROOT "$ENV{HYT_SDK_ROOT}")
endif()

find_package(Threads REQUIRED)
find_package(SQLite3 REQUIRED)

add_executable(hyt-native-bridge
  src/main.cpp
  src/util.cpp
  src/store.cpp
  src/message.cpp
  src/sdk_host.cpp
)
# 只用 SQLite 的头文件：macOS 链接了 EC SDK 时，sqlite3 的实现由 SDK 静态库提供。
# 同时链系统 libsqlite3 会让同一个进程里出现两套 sqlite3，SDK 内部查询会跳到另一版实现并崩溃。
target_include_directories(hyt-native-bridge PRIVATE ${SQLite3_INCLUDE_DIRS})
target_link_libraries(hyt-native-bridge PRIVATE Threads::Threads)
if(NOT MSVC)
  target_compile_options(hyt-native-bridge PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()

if(APPLE)
  set(HYT_SDK_PLATFORM "mac")
elseif(WIN32)
  set(HYT_SDK_PLATFORM "win")
else()
  set(HYT_SDK_PLATFORM "linux")
endif()

set(HYT_SDK_INCLUDE "${HYT_SDK_ROOT}/include/${HYT_SDK_PLATFORM}")
set(HYT_SDK_LIB "${HYT_SDK_ROOT}/lib/${HYT_SDK_PLATFORM}")
set(HYT_SDK_FOUND FALSE)

if(HYT_SDK_ROOT AND EXISTS "${HYT_SDK_INCLUDE}")
  if(APPLE)
    if(EXISTS "${HYT_SDK_LIB}/libECMacSDK.a")
      set(HYT_SDK_FOUND TRUE)
    endif()
  elseif(WIN32)
    if(EXISTS "${HYT_SDK_LIB}/ECsdk.lib" OR EXISTS "${HYT_SDK_ROOT}/libSdk/ECsdk.lib")
      set(HYT_SDK_FOUND TRUE)
    endif()
  else()
    if(EXISTS "${HYT_SDK_LIB}/libECsdk.so" OR EXISTS "${HYT_SDK_LIB}/libECMacSDK.a")
      set(HYT_SDK_FOUND TRUE)
    endif()
  endif()
endif()

if(HYT_SDK_FOUND)
  message(STATUS "EC SDK: ${HYT_SDK_INCLUDE}")
  target_compile_definitions(hyt-native-bridge PRIVATE HYT_WITH_EC_SDK=1)
  target_include_directories(hyt-native-bridge PRIVATE "${HYT_SDK_INCLUDE}")

  if(APPLE)
    target_link_libraries(hyt-native-bridge PRIVATE
      "${HYT_SDK_LIB}/libECMacSDK.a"
      "${HYT_SDK_LIB}/ECMediaSDK.framework/ECMediaSDK"
      "-framework AudioToolbox"
      "-framework CoreAudio"
      "-framework AVFoundation"
      "-framework CoreMedia"
      "-framework CoreVideo"
      "-framework VideoToolbox"
      "-framework AudioUnit"
      "-framework VideoDecodeAcceleration"
      "-framework CoreMediaIO"
      "-framework Foundation"
      "-framework AppKit"
      "-framework Cocoa"
      "-framework CoreServices"
      "-framework CoreFoundation"
      "-framework ApplicationServices"
      "-framework Security"
      "-framework SystemConfiguration"
      "-framework IOKit"
      "-framework QuartzCore"
      "-framework Quartz"
      "-framework OpenGL"
      "-framework IOSurface"
      "-framework MediaLibrary"
      "-framework ScreenSaver"
      "-framework WebKit"
      "-framework CFNetwork"
      "-lz"
      "-lbz2"
    )
  elseif(WIN32)
    if(EXISTS "${HYT_SDK_LIB}/ECsdk.lib")
      set(HYT_WIN_SDK_LIB "${HYT_SDK_LIB}")
    else()
      set(HYT_WIN_SDK_LIB "${HYT_SDK_ROOT}/libSdk")
    endif()
    target_link_directories(hyt-native-bridge PRIVATE "${HYT_WIN_SDK_LIB}")
    # Windows 的 SDK 是 DLL，sqlite3 不在里面，仍要自己提供。
    target_link_libraries(hyt-native-bridge PRIVATE
      "${HYT_WIN_SDK_LIB}/ECsdk.lib"
      "${HYT_WIN_SDK_LIB}/ecmedia.lib"
      ws2_32
      winhttp
      SQLite::SQLite3
    )
  else()
    # Linux 版仅提供配置参考：SDK 运行时依赖较多，缺 .so 时请留在 stub 模式。
    target_link_libraries(hyt-native-bridge PRIVATE SQLite::SQLite3)
    if(EXISTS "${HYT_SDK_LIB}/libECsdk.so")
      target_link_directories(hyt-native-bridge PRIVATE "${HYT_SDK_LIB}")
      target_link_libraries(hyt-native-bridge PRIVATE
        ECsdk
        ecmedia
        ccpclient
        pthread
        dl
      )
    endif()
  endif()
else()
  message(STATUS "EC SDK 未找到，编译 stub（仅本地历史/会话可用）")
  target_link_libraries(hyt-native-bridge PRIVATE SQLite::SQLite3)
endif()

if(NOT WIN32)
  find_package(CURL)
  if(CURL_FOUND)
    target_compile_definitions(hyt-native-bridge PRIVATE HYT_WITH_CURL=1)
    target_link_libraries(hyt-native-bridge PRIVATE CURL::libcurl)
  else()
    message(STATUS "libcurl 未找到：auth.login 需显式传入 appId/appToken")
  endif()
endif()

set_target_properties(hyt-native-bridge PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
# 多配置生成器（Visual Studio）会把 Release 放进 bin/Release；固定下来，插件打包只认一个位置。
foreach(config ${CMAKE_CONFIGURATION_TYPES})
  string(TOUPPER "${config}" upper)
  set_target_properties(hyt-native-bridge PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY_${upper} "${CMAKE_BINARY_DIR}/bin"
  )
endforeach()
