#!/bin/bash
# Create DMG from Electron app with ad-hoc signing workaround
# Usage: ./scripts/build-and-sign.sh [arch]
# Default arch: arm64

set -e

APP_NAME="Hermes Agent"
ARCH="${1:-arm64}"
VERSION=$(node -p "require('./package.json').version")
DIST_DIR="dist/mac-${ARCH}"
DMG_NAME="${APP_NAME}-${VERSION}-${ARCH}.dmg"

echo "=== Electron Mac Build & Sign Script ==="
echo "App: ${APP_NAME} ${VERSION} (${ARCH})"

# Step 1: Build (may fail on signing but creates app bundle)
echo ""
echo "[1/4] Building app with electron-builder..."
npm run build:mac || true

if [ ! -d "${DIST_DIR}/${APP_NAME}.app" ]; then
  echo "Error: App not found at ${DIST_DIR}/${APP_NAME}.app"
  exit 1
fi

# Step 2: Copy to /tmp for cleanup
echo ""
echo "[2/4] Copying app to /tmp for extended attribute cleanup..."
rm -rf "/tmp/${APP_NAME}.app"
cp -R "${DIST_DIR}/${APP_NAME}.app" "/tmp/${APP_NAME}.app"

# Step 3: Clean extended attributes and sign
echo ""
echo "[3/4] Cleaning extended attributes and signing..."
xattr -rc "/tmp/${APP_NAME}.app"
codesign --force --deep --sign - "/tmp/${APP_NAME}.app"

# Step 4: Move back and create DMG
echo ""
echo "[4/4] Creating DMG..."
rm -rf "${DIST_DIR}/${APP_NAME}.app"
mv "/tmp/${APP_NAME}.app" "${DIST_DIR}/${APP_NAME}.app"

hdiutil create -volname "${APP_NAME}" \
  -srcfolder "${DIST_DIR}/${APP_NAME}.app" \
  -ov -format UDZO \
  "${DIST_DIR}/${DMG_NAME}"

echo ""
echo "=== Done ==="
echo "DMG: ${DIST_DIR}/${DMG_NAME}"
ls -lh "${DIST_DIR}/${DMG_NAME}"

# Verify signature
echo ""
echo "App signature:"
codesign -dvvvv "${DIST_DIR}/${APP_NAME}.app" 2>&1 | head -5