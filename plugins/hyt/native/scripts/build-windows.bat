@echo off
rem Windows 构建：链接真实 EC SDK，输出 build-win\Release\hyt-native-bridge.exe。
rem 用法：
rem   set HYT_SDK_ROOT=C:\path\to\sdk
rem   native\scripts\build-windows.bat
rem SDK 目录需包含 include\win\*.h 与 lib\win\ECsdk.lib、ecmedia.lib、ECsdk.dll。
setlocal
set HERE=%~dp0..
if "%HYT_SDK_ROOT%"=="" (
  echo HYT_SDK_ROOT 未设置，构建出的桥接只能读本地历史，不能登录和收发。
  cmake -S "%HERE%" -B "%HERE%\build-win" -G "Visual Studio 17 2022" -A x64
) else (
  cmake -S "%HERE%" -B "%HERE%\build-win" -G "Visual Studio 17 2022" -A x64 -DHYT_SDK_ROOT="%HYT_SDK_ROOT%"
)
if errorlevel 1 exit /b 1
cmake --build "%HERE%\build-win" --config Release
if errorlevel 1 exit /b 1
echo 构建完成：%HERE%\build-win\Release\hyt-native-bridge.exe
endlocal
