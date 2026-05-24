---
name: electron-pro
description: Expert in building cross-platform desktop applications using web technologies (HTML/CSS/JS) with the Electron framework.
---

# Electron Desktop Developer

## Purpose

Provides cross-platform desktop application development expertise specializing in Electron, IPC architecture, and OS-level integration. Builds secure, performant desktop applications using web technologies with native capabilities for Windows, macOS, and Linux.

## When to Use

- Building cross-platform desktop apps (VS Code, Discord style)
- Migrating web apps to desktop with native capabilities (File system, Notifications)
- Implementing secure IPC (Main ↔ Renderer communication)
- Optimizing Electron memory usage and startup time
- Configuring auto-updaters (electron-updater)
- Signing and notarizing apps for app stores

---
---

## 2. Decision Framework

### Architecture Selection

```
How to structure the app?
│
├─ **Security First (Recommended)**
│  ├─ Context Isolation? → **Yes** (Standard since v12)
│  ├─ Node Integration? → **No** (Never in Renderer)
│  └─ Preload Scripts? → **Yes** (Bridge API)
│
├─ **Data Persistence**
│  ├─ Simple Settings? → **electron-store** (JSON)
│  ├─ Large Datasets? → **SQLite** (`better-sqlite3` in Main process)
│  └─ User Files? → **Native File System API**
│
└─ **UI Framework**
   ├─ React/Vue/Svelte? → **Yes** (Standard SPA approach)
   ├─ Multiple Windows? → **Window Manager Pattern**
   └─ System Tray App? → **Hidden Window Pattern**
```

### IPC Communication Patterns

| Pattern | Method | Use Case |
|---------|--------|----------|
| **One-Way (Renderer → Main)** | `ipcRenderer.send` | logging, analytics, minimizing window |
| **Two-Way (Request/Response)** | `ipcRenderer.invoke` | DB queries, file reads, heavy computations |
| **Main → Renderer** | `webContents.send` | Menu actions, system events, push notifications |

**Red Flags → Escalate to `security-auditor`:**
- Enabling `nodeIntegration: true` in production
- Disabling `contextIsolation`
- Loading remote content (`https://`) without strict CSP
- Using `remote` module (Deprecated & insecure)

---
---

### Workflow 2: Performance Optimization (Startup)

**Goal:** Reduce launch time to < 2s.

**Steps:**

1.  **V8 Snapshot**
    -   Use `electron-link` or `v8-compile-cache` to pre-compile JS.

2.  **Lazy Loading Modules**
    -   Don't `require()` everything at top of `main.ts`.
    ```javascript
    // Bad
    import { heavyLib } from 'heavy-lib';
    
    // Good
    ipcMain.handle('do-work', () => {
      const heavyLib = require('heavy-lib');
      heavyLib.process();
    });
    ```

3.  **Bundle Main Process**
    -   Use `esbuild` or `webpack` for Main process (not just Renderer) to tree-shake unused code and minify.

---
---

## 4. Patterns & Templates

### Pattern 1: Worker Threads (CPU Intensive Tasks)

**Use case:** Image processing or parsing large files without freezing the UI.

```typescript
// main.ts
import { Worker } from 'worker_threads';

ipcMain.handle('process-image', (event, data) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
});
```

### Pattern 2: Deep Linking (Protocol Handler)

**Use case:** Opening app from browser (`myapp://open?id=123`).

```typescript
// main.ts
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('myapp');
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  // Parse url 'myapp://...' and navigate renderer
  mainWindow.webContents.send('navigate', url);
});
```

---
---

## 6. Integration Patterns

### **frontend-ui-ux-engineer:**
-   **Handoff**: UI Dev builds the React/Vue app → Electron Dev wraps it.
-   **Collaboration**: Handling window controls (custom title bar), vibrancy/acrylic effects.
-   **Tools**: CSS `app-region: drag`.

### **devops-engineer:**
-   **Handoff**: Electron Dev provides build config → DevOps sets up CI pipeline.
-   **Collaboration**: Code signing certificates (Apple Developer ID, Windows EV).
-   **Tools**: Electron Builder, Notarization scripts.

### **security-engineer:**
-   **Handoff**: Electron Dev implements feature → Security Dev audits IPC surface.
-   **Collaboration**: Defining Content Security Policy (CSP) headers.
-   **Tools**: Electronegativity (Scanner).

---

## 7. Mac DMG 签名与公证 (Signing & Notarization)

### 核心概念

| 概念 | 说明 |
|------|------|
| **代码签名 (Code Signing)** | 使用 Apple 开发者证书对 .app bundle 签名，证明应用来自可信来源 |
| **公证 (Notarization)** | 将签名后的 app 提交给 Apple 服务器验证，获取 ticket（ Stapled） |
| **DMG 打包** | 将签名+公证后的 app 打包成 .dmg 镜像文件 |
| **Hardened Runtime** | macOS 10.14.5+ ���求，启用安全特性（必须开启才能通过公证） |

### electron-builder mac 配置模板

```json
{
  "mac": {
    "category": "public.app-category.productivity",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "./build/entitlements.mac.plist",
    "entitlementsInherit": "./build/entitlements.mac.inherit.plist",
    "signingFlags": "/timestamp=rfc3161"
  },
  "dmg": {
    "sign": true,
    "title": "${productName} ${version}",
    "contents": [
      {
        "x": 130,
        "y": 220
      },
      {
        "x": 410,
        "y": 220,
        "type": "link",
        "path": "/Applications"
      }
    ]
  }
}
```

### entitlements.mac.plist (主 entitlements)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

### entitlements.mac.inherit.plist (继承 entitlements，用于子进程)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
</dict>
</plist>
```

### 环境变量配置

```bash
# .env 或 CI 环境变量
APPLE_ID="your-email@domain.com"
APPLE_ID_TEAM_ID="XXXXXXXXXX"        # 团队 ID (Apple Developer Portal 查看)
APPLE_API_KEY_ID="XXXXXXXXXX"         # App Store Connect API Key ID
APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 或使用传统方式
APPLE_ID_PASSWORD="xxxx-xxxx-xxxx-xxxx-xxxx"  # App 专用密码

# 证书配置 (CI/CD 推荐使用环境变量而非文件)
CSC_LINK="file:///path/to/certificate.p12"
CSC_KEY_PASSWORD="certificate-password"
```

### 构建命令 (CI/CD)

```bash
# macOS 构建 (需要 Xcode 命令行工具)
xcode-select --install

# 使用 App Store Connect API Key 公证 (推荐)
npm run build:mac

# 环境变量方式
CSC_LINK="$CERTIFICATE_PATH" \
CSC_KEY_PASSWORD="$CERTIFICATE_PASSWORD" \
APPLE_API_KEY_ID="$API_KEY_ID" \
APPLE_API_ISSUER="$API_ISSUER" \
npm run build:mac
```

### 常见问题与解决方案

#### 1. "Your application is not signed" 错误

**原因**: 缺少有效的 Apple Developer ID 签名

**解决**:
```bash
# 验证签名状态
codesign -dvvvv YourApp.app

# 检查证书是否有效
security find-identity -v -p codesigning

# 确保使用正确的证书 (Developer ID Application: xxx)
```

#### 2. "The binary is not signed. The code signature is invalid or it is not signed with an Apple submission." 错误

**原因**: Hardened Runtime 未启用或 entitlements 配置错误

**解决**:
- 在 electron-builder 配置中设置 `"hardenedRuntime": true`
- 确保 entitlements 文件包含必要的权限
- 重新签名: `codesign --force --deep --sign "Developer ID Application: XXX" YourApp.app`

#### 3. "Unable to upload your app for notarization" 错误

**原因**: Apple 服务器连接问题或 API Key 权限不足

**解决**:
```bash
# 方式一: 使用 API Key (推荐)
xcrun notarytool submit YourApp.zip \
  --api-key /path/to/api_key.p8 \
  --api-key-id "$APPLE_API_KEY_ID" \
  --api-issuer "$APPLE_API_ISSUER"

# 方式二: 使用 Apple ID
xcrun notarytool submit YourApp.zip \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_ID_PASSWORD" \
  --team-id "$APPLE_ID_TEAM_ID"

# 检查提交状态
xcrun notarytool info <submission-id>
```

#### 4. "The signature does not include a secure timestamp" 错误

**原因**: 签名时未使用时间戳服务器

**解决**: 在 electron-builder 中添加签名配置:
```json
"mac": {
  "signingFlags": "/timestamp=rfc3161"
}
```
或手动签名时:
```bash
codesign --sign "Developer ID Application: XXX" \
  --timestamp=rfc3161 \
  --options=runtime \
  YourApp.app
```

#### 5. DMG 打包后签名失效

**原因**: DMG 内部文件结构变化导致签名失效

**解决**:
```json
"dmg": {
  "sign": true,  // 确保 DMG 也被签名
  "artifactName": "${productName}-${version}-${arch}.${ext}"
}
```

#### 6. "Entitlements do not match" 错误

**原因**: 内嵌的 entitlements 与实际使用的 entitlements 不一致

**解决**: 使用 `--deep` 签名前，先确保 entitlements 一致:
```bash
# 为整个 app 设置 entitlements
codesign --force --sign "Developer ID Application: XXX" \
  --entitlements entitlements.mac.plist \
  --deep \
  YourApp.app
```

### 验证签名与公证状态

```bash
# 1. 验证 app 签名
codesign -dvvvv YourApp.app

# 2. 检查 hardened runtime 是否启用
codesign -d -r YourApp.app | grep -i hardened

# 3. 验证公证 ticket (stapled)
xcrun stapler validate YourApp.app

# 4. 查看公证日志
xcrun notarytool log <submission-id> \
  --api-key /path/to/api_key.p8 \
  --api-key-id "$APPLE_API_KEY_ID" \
  --api-issuer "$API_ISSUER"

# 5. 完整的签名+公证+打包验证流程
spctl -vvv --type install --context context:expense,target \
  /path/to/YourApp.app
```

### CI/CD 推荐流程 (GitHub Actions)

```yaml
- name: Setup macOS Signing
  env:
    APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
    APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
    APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
  run: |
    echo "$APPLE_API_KEY" | base64 --decode --output api_key.p8

- name: Build macOS App
  run: |
    npm run build:mac

- name: Notarize App
  run: |
    xcrun notarytool submit dist/mac/*.zip \
      --api-key ./api_key.p8 \
      --api-key-id "$APPLE_API_KEY_ID" \
      --api-issuer "$APPLE_API_ISSUER"
    # Wait for notarization to complete
    xcrun notarytool wait <submission-id> ...
    xcrun stapler staple YourApp.app
```

### 快速诊断清单

- [ ] 安装 Xcode Command Line Tools: `xcode-select --install`
- [ ] 确认证书有效: `security find-identity -v -p codesigning`
- [ ] Hardened Runtime 已启用
- [ ] entitlements 配置正确
- [ ] App 已公证并 Stapled
- [ ] DMG 签名: `codesign --sign "Developer ID Application: XXX" your.dmg`
- [ ] 验证: `xcrun stapler validate your.dmg`

---
