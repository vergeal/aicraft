#!/usr/bin/env bash
# macOS 构建：默认链接仓库内的 EC SDK（native/sdk，随仓库分发）。
# 设置 HYT_SDK_ROOT 可换成别的 SDK 目录，格式同上（含 include/ 与 lib/）。
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="${BUILD_DIR:-$here/build}"
sdk_root="${HYT_SDK_ROOT:-$here/sdk}"

args=(-S "$here" -B "$build_dir" -DCMAKE_BUILD_TYPE=Release "-DHYT_SDK_ROOT=$sdk_root")

cmake "${args[@]}"
make -C "$build_dir" -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

# 入库的发布产物：插件打包时优先取 prebuilt，换机器克隆后不必再编一次。
arch="$(uname -m)"
case "$arch" in
  x86_64) arch=x64 ;;
esac
prebuilt="$here/prebuilt/darwin-$arch"
mkdir -p "$prebuilt"
cp "$build_dir/bin/hyt-native-bridge" "$prebuilt/hyt-native-bridge"
if ! otool -l "$prebuilt/hyt-native-bridge" | grep -q "@executable_path/../Frameworks"; then
  install_name_tool -add_rpath "@executable_path/../Frameworks" "$prebuilt/hyt-native-bridge"
fi

echo "构建完成：$prebuilt/hyt-native-bridge"
