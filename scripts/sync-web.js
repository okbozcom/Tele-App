const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'mobile', 'dist');
const dest = path.join(__dirname, '..', 'server', 'public');

if (fs.existsSync(src)) {
  // Sync static html pages (landing, privacy, terms, admin) into mobile/dist first
  try {
    require(path.join(__dirname, '..', 'server', 'scripts', 'sync-public.js'));
  } catch (err) {
    console.warn('[sync-web] sync-public warning:', err.message);
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log('[sync-web] Successfully copied mobile/dist -> server/public!');
} else {
  console.error('[sync-web] Error: mobile/dist does not exist. Run expo export -p web first.');
  process.exit(1);
}
