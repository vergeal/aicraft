#!/usr/bin/env bash
# macOS 构建：链接真实 EC SDK 时设置 HYT_SDK_ROOT，指向包含 include/ 与 lib/ 的目录。
# 不设置则编译 stub（无登录/收发，仅本地历史可用）。
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="${BUILD_DIR:-$here/build}"
sdk_root="${HYT_SDK_ROOT:-}"

args=(-S "$here" -B "$build_dir" -DCMAKE_BUILD_TYPE=Release)
if [[ -n "$sdk_root" ]]; then
  args+=("-DHYT_SDK_ROOT=$sdk_root")
fi

cmake "${args[@]}"
make -C "$build_dir" -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

echo "构建完成：$build_dir/bin/hyt-native-bridge"

# 打包需要 ECMediaSDK.framework；留在 sdk-runtime 里，换机器打包时不必再找 SDK。
if [[ -n "$sdk_root" && -d "$sdk_root/lib/mac/ECMediaSDK.framework" ]]; then
  mkdir -p "$here/sdk-runtime"
  cp -R "$sdk_root/lib/mac/ECMediaSDK.framework" "$here/sdk-runtime/"
fi
