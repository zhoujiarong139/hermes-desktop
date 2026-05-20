const { execSync } = require('child_process');
const path = process.argv[2];

// Remove all extended attributes
try {
  execSync(`xattr -cr "${path}"`, { stdio: 'pipe' });
  console.log('Cleaned extended attributes');
} catch (e) {
  console.log('xattr clean failed:', e.message);
}
