#!/usr/bin/env bash
# render-homebrew.sh <sign-macos dir> <build-archives dir> <tap dir>: writes Formula aicraft-v2.rb with the
# hashes of the signed macOS and the Linux archives.
. "$(dirname "$0")/lib.sh"

macos=$1 archives=$2 tap=$3
sum() { sha256 "$1" | cut -c1-64; }
base="https://opencode.ai/files/bin/$AICRAFT_VERSION"
cat > "$tap/aicraft-v2.rb" <<FORMULA
# typed: false
# frozen_string_literal: true

class AicraftV2 < Formula
  desc "AI Craft V2 - the AI coding agent for the terminal"
  homepage "https://github.com/anomalyco/opencode"
  version "$AICRAFT_VERSION"
  license "MIT"

  depends_on "ripgrep"
  conflicts_with "opencode", because: "both install an aicraft binary"

  on_macos do
    if Hardware::CPU.arm?
      url "$base/aicraft-darwin-arm64.zip"
      sha256 "$(sum "$macos/aicraft-darwin-arm64.zip")"
    else
      url "$base/aicraft-darwin-x64-baseline.zip"
      sha256 "$(sum "$macos/aicraft-darwin-x64-baseline.zip")"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "$base/aicraft-linux-arm64.tar.gz"
      sha256 "$(sum "$archives/aicraft-linux-arm64.tar.gz")"
    else
      url "$base/aicraft-linux-x64-baseline.tar.gz"
      sha256 "$(sum "$archives/aicraft-linux-x64-baseline.tar.gz")"
    end
  end

  def install
    bin.install "opencode"
  end
end
FORMULA
cat "$tap/aicraft-v2.rb"
