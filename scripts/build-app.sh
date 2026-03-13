#!/usr/bin/env bash
# Build camel-pad.app for macOS distribution
set -euo pipefail

APP_NAME="camel-pad"
VERSION=$(node -e "console.log(require('./package.json').version)")
BUNDLE_ID="com.camelpad.app"
DIST_DIR="dist"
APP_DIR="${DIST_DIR}/${APP_NAME}.app"

echo "Building camel-pad ${VERSION} macOS app bundle..."
mkdir -p "${DIST_DIR}"

# 0. Build Swift tray binary
TRAY_SWIFT_DIR="tray_swift"
TRAY_BIN_DIR="src/static/traybin"
TRAY_BIN_DEST="${TRAY_BIN_DIR}/tray_darwin_release"

echo "  Building Swift tray binary..."
mkdir -p "${TRAY_BIN_DIR}"
cd "${TRAY_SWIFT_DIR}"
swift build -c release
cd ..
cp "${TRAY_SWIFT_DIR}/.build/release/tray" "${TRAY_BIN_DEST}"
chmod +x "${TRAY_BIN_DEST}"

# 1. Compile bun binary
echo "  Compiling arm64..."
bun build --compile \
  --target bun-darwin-arm64 \
  --minify \
  --outfile "${DIST_DIR}/camel-pad-tray" \
  src/tray.ts

# 2. Create .app bundle structure
echo "  Creating .app bundle..."
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# 3. Copy the binary
cp "${DIST_DIR}/camel-pad-tray" "${APP_DIR}/Contents/MacOS/${APP_NAME}"
chmod +x "${APP_DIR}/Contents/MacOS/${APP_NAME}"

# 4. Write Info.plist
#    LSUIElement=true: no Dock icon, no app switcher entry (agent app)
cat > "${APP_DIR}/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>CamelPad</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>CamelPad</string>
  <key>CFBundleIconName</key>
  <string>CamelPad</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Copyright © 2026 Michael R Pleimann. MIT License.</string>
</dict>
</plist>
PLIST

# 5. Build icon assets
if [ -d "assets/CamelPad.icon" ]; then
  # 5a. Compile Assets.car for macOS 26 Tahoe Liquid Glass rendering
  if xcrun --find actool &>/dev/null; then
    echo "  Compiling Assets.car (Liquid Glass)..."
    ACTOOL=$(xcrun -f actool)
    ACTOOL_PLIST=$(mktemp /tmp/actool_info.XXXXXX.plist)
    "$ACTOOL" "assets/CamelPad.icon" \
      --compile "${APP_DIR}/Contents/Resources" \
      --output-format human-readable-text \
      --notices --warnings --errors \
      --output-partial-info-plist "$ACTOOL_PLIST" \
      --app-icon CamelPad \
      --include-all-app-icons \
      --enable-on-demand-resources NO \
      --development-region en \
      --target-device mac \
      --minimum-deployment-target 26.0 \
      --platform macosx
    rm -f "$ACTOOL_PLIST"
    echo "  Compiled Assets.car"
  else
    echo "  Warning: actool not found (Xcode required). Skipping Assets.car."
  fi

  # 5b. Generate legacy .icns for macOS 13–15
  echo "  Generating legacy CamelPad.icns..."
  swift scripts/export-icon.swift
fi

if [ -f "assets/CamelPad.icns" ]; then
  cp assets/CamelPad.icns "${APP_DIR}/Contents/Resources/CamelPad.icns"
  echo "  Copied CamelPad.icns"
else
  echo "  Note: No assets/CamelPad.icns found. App will use default icon on macOS 13–15."
fi

echo ""
echo "Built: ${APP_DIR}"
echo ""
echo "To test: open '${APP_DIR}'"
echo ""
echo "Optional next steps:"
echo ""
echo "  Code-sign (requires Apple Developer account):"
echo "    codesign --deep --force --sign 'Developer ID Application: Your Name (TEAMID)' '${APP_DIR}'"
echo ""
echo "  Notarize (required for Gatekeeper on other machines):"
echo "    xcrun notarytool submit '${APP_DIR}' --apple-id you@example.com --team-id TEAMID --wait"
echo ""
echo "  Create distributable DMG:"
echo "    hdiutil create -volname 'camel-pad' -srcfolder '${APP_DIR}' -ov -format UDZO '${DIST_DIR}/${APP_NAME}-${VERSION}.dmg'"
