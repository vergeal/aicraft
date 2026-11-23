@echo off
rem Windows 构建：链接仓库内的 EC SDK（native\sdk，随仓库分发），
rem 输出 native\build-win\bin\hyt-native-bridge.exe，并复制到 native\prebuilt\win32-x64\。
rem 用法：
rem   native\scripts\build-windows.bat                     使用仓库内 native\sdk
rem   set HYT_SDK_ROOT=C:\path\to\sdk  再运行本脚本         换 SDK 版本
rem SDK 目录需包含 include\win\*.h 与 lib\win\ECsdk.lib、ecmedia.lib、ECsdk.dll。
rem 虹云通 Windows SDK 是 32 位（ECsdk.dll / Ecmedia.dll 均为 x86），所以这里固定 -A Win32：
rem 桥接是独立进程，x64 桌面端可以直接拉起 32 位 exe。SDK 换成 x64 时把 -A 改成 x64。
setlocal
set HERE=%~dp0..
if "%HYT_SDK_ROOT%"=="" set HYT_SDK_ROOT=%HERE%\sdk
cmake -S "%HERE%" -B "%HERE%\build-win" -G "Visual Studio 17 2022" -A Win32 -DHYT_SDK_ROOT="%HYT_SDK_ROOT%"
if errorlevel 1 exit /b 1
cmake --build "%HERE%\build-win" --config Release
if errorlevel 1 exit /b 1
if not exist "%HERE%\prebuilt\win32-x64" mkdir "%HERE%\prebuilt\win32-x64"
copy /Y "%HERE%\build-win\bin\hyt-native-bridge.exe" "%HERE%\prebuilt\win32-x64\hyt-native-bridge.exe" >nul
echo 构建完成：%HERE%\prebuilt\win32-x64\hyt-native-bridge.exe
endlocal
