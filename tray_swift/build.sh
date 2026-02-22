#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$REPO_ROOT/assets/traybin/tray_darwin_release"

echo "Building Swift tray binary..."

cd "$SCRIPT_DIR"

# Detect native arch for the build host; cross-compile if requested via ARCH env var
ARCH="${ARCH:-$(uname -m)}"

if [ "$ARCH" = "arm64" ]; then
    SWIFT_ARCH="arm64-apple-macosx13.0"
elif [ "$ARCH" = "x86_64" ]; then
    SWIFT_ARCH="x86_64-apple-macosx13.0"
else
    echo "Unknown arch: $ARCH" >&2
    exit 1
fi

swift build -c release --arch "$ARCH"

BIN=".build/$ARCH-apple-macosx/release/tray"
if [ ! -f "$BIN" ]; then
    # SPM sometimes uses a slightly different path
    BIN=".build/release/tray"
fi

if [ ! -f "$BIN" ]; then
    echo "Build failed: binary not found" >&2
    exit 1
fi

cp "$BIN" "$DEST"
chmod +x "$DEST"
echo "Done: $DEST ($(du -sh "$DEST" | cut -f1))"
