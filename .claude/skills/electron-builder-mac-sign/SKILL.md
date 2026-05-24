---
name: electron-builder-mac-sign
description: Fix macOS code signing errors in electron-builder and create DMG packages
when_to_use: macOS build fails with "resource fork, Finder information, or similar detritus not allowed" or DMG creation fails
---

# Electron Builder macOS 签名与打包

## 问题症状

```
codesign --sign - --force --timestamp ... Helper (GPU).app:
resource fork, Finder information, or similar detritus not allowed
```

或 electron-builder 打包失败，即使配置了 `sign: false` 仍尝试 ad-hoc 签名。

## 根因

Electron 包的 Helper 应用（GPU/Renderer/Plugin）包含 macOS 扩展属性，与代码签名不兼容。afterPack hook 在签名**之前**运行，无法解决此问题。

## 解决方案：两步法

### 步骤 1：构建 app（允许签名失败）

```bash
# 清理旧构建
rm -rf dist/mac-*

# 构建（签名会失败但 app 会生成）
npm run build:mac
# 或：npx electron-builder --mac
```

### 步骤 2：手动清理、签名、创建 DMG

创建清理并打包脚本：

```bash
#!/bin/bash
set -e

APP_NAME="Hermes Agent"
VERSION="0.4.3"
ARCH="arm64"
DIST_DIR="dist/mac-${ARCH}"
DMG_NAME="${APP_NAME}-${VERSION}-${ARCH}.dmg"

# 复制到 /tmp 清除扩展属性
echo "Copying app to /tmp for cleanup..."
rm -rf "/tmp/${APP_NAME}.app"
cp -R "${DIST_DIR}/${APP_NAME}.app" "/tmp/${APP_NAME}.app"

# 清理扩展属性
echo "Cleaning extended attributes..."
xattr -rc "/tmp/${APP_NAME}.app"

# Ad-hoc 签名
echo "Signing app..."
codesign --force --deep --sign - "/tmp/${APP_NAME}.app"

# 移回
echo "Moving signed app back..."
rm -rf "${DIST_DIR}/${APP_NAME}.app"
mv "/tmp/${APP_NAME}.app" "${DIST_DIR}/${APP_NAME}.app"

# 创建 DMG
echo "Creating DMG..."
hdiutil create -volname "${APP_NAME}" \
  -srcfolder "${DIST_DIR}/${APP_NAME}.app" \
  -ov -format UDZO \
  "${DIST_DIR}/${DMG_NAME}"

echo "Done: ${DIST_DIR}/${DMG_NAME}"
```

保存为 `scripts/create-dmg.sh` 并执行：

```bash
chmod +x scripts/create-dmg.sh
./scripts/create-dmg.sh
```

## 永久修复（如果 electron-builder 支持 afterSign hook）

electron-builder 26.x 暂不支持 afterSign 覆盖签名逻辑。临时方案：

1. 使用上述两步脚本
2. 或配置 CI/CD 使用 Apple Developer 证书签名

## electron-builder.yml 配置

```yaml
mac:
  sign: false        # 尝试禁用签名，但会触发 ad-hoc 回退
  forceCodeSigning: false
  hardenedRuntime: false
dmg:
  sign: false        # DMG 也不签名
```

## 验证签名

```bash
# 检查 app 签名
codesign -dvvvv "dist/mac-arm64/Hermes Agent.app"

# 检查 DMG
hdiutil attach "dist/mac-arm64/Hermes-Agent-0.4.3-arm64.dmg"
codesign -dvvvv "/Volumes/Hermes Agent/Hermes Agent.app"
hdiutil detach "/Volumes/Hermes Agent"
```

## 正式发布要求

ad-hoc 签名仅适合开发/测试。正式发布需要：
- Apple Developer 账号
- Developer ID Application 证书
- 配置 CSC_LINK 和 CSC_KEY_PASSWORD 环境变量