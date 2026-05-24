const { execSync } = require('child_process')
const path = require('path')

// Runs AFTER electron-builder creates the app but BEFORE signing
// Cleans extended attributes that block code signing
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  try {
    execSync(`xattr -rc "${appPath}"`, { stdio: 'ignore', shell: '/bin/bash' })
  } catch {}
}