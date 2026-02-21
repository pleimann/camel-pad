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

# 1. Compile for both architectures
echo "  Compiling arm64..."
bun build --compile \
  --target bun-darwin-arm64 \
  --minify \
  --outfile "${DIST_DIR}/camel-pad-tray-arm64" \
  src/tray.ts

echo "  Compiling x64..."
bun build --compile \
  --target bun-darwin-x64 \
  --minify \
  --outfile "${DIST_DIR}/camel-pad-tray-x64" \
  src/tray.ts

# 2. Create universal binary
echo "  Creating universal binary..."
lipo -create \
  "${DIST_DIR}/camel-pad-tray-arm64" \
  "${DIST_DIR}/camel-pad-tray-x64" \
  -output "${DIST_DIR}/camel-pad-tray"

# 3. Create .app bundle structure
echo "  Creating .app bundle..."
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# 4. Copy the binary
cp "${DIST_DIR}/camel-pad-tray" "${APP_DIR}/Contents/MacOS/${APP_NAME}"
chmod +x "${APP_DIR}/Contents/MacOS/${APP_NAME}"

# 5. Write Info.plist
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
  <string>camel-pad</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Copyright © 2025 camel-pad contributors. MIT License.</string>
</dict>
</plist>
PLIST

# 6. Copy app icon if it exists
if [ -f "assets/AppIcon.icns" ]; then
  cp assets/AppIcon.icns "${APP_DIR}/Contents/Resources/AppIcon.icns"
  echo "  Copied AppIcon.icns"
else
  echo "  Note: No assets/AppIcon.icns found. App will use default icon."
  echo "        Create one with: iconutil -c icns assets/AppIcon.iconset"
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
