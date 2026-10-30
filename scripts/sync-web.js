const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'mobile', 'dist');
const dest = path.join(__dirname, '..', 'server', 'public');

if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log('[sync-web] Successfully copied mobile/dist -> server/public!');
} else {
  console.error('[sync-web] Error: mobile/dist does not exist. Run expo export -p web first.');
  process.exit(1);
}
