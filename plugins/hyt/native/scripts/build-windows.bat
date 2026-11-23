@echo off
rem Windows 构建：链接仓库内的 EC SDK（native\sdk，随仓库分发），
rem 输出 native\build-win\Release\hyt-native-bridge.exe，并复制到 native\prebuilt\win32-x64\。
rem 用法：
rem   native\scripts\build-windows.bat                     使用仓库内 native\sdk
rem   set HYT_SDK_ROOT=C:\path\to\sdk  再运行本脚本         换 SDK 版本
rem SDK 目录需包含 include\win\*.h 与 lib\win\ECsdk.lib、ecmedia.lib、ECsdk.dll。
setlocal
set HERE=%~dp0..
if "%HYT_SDK_ROOT%"=="" set HYT_SDK_ROOT=%HERE%\sdk
cmake -S "%HERE%" -B "%HERE%\build-win" -G "Visual Studio 17 2022" -A x64 -DHYT_SDK_ROOT="%HYT_SDK_ROOT%"
if errorlevel 1 exit /b 1
cmake --build "%HERE%\build-win" --config Release
if errorlevel 1 exit /b 1
if not exist "%HERE%\prebuilt\win32-x64" mkdir "%HERE%\prebuilt\win32-x64"
copy /Y "%HERE%\build-win\Release\hyt-native-bridge.exe" "%HERE%\prebuilt\win32-x64\hyt-native-bridge.exe" >nul
echo 构建完成：%HERE%\prebuilt\win32-x64\hyt-native-bridge.exe
endlocal
