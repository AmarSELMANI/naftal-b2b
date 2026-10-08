// Metro bundler configuration.
//
// Added for one specific reason: on Windows, running `expo export` while the
// dev server is running crashes the dev server. Expo's CLI creates temporary
// `node_modules/@expo/.spawn-async-*` directories and removes them again, and
// Metro's fallback file watcher tries to lstat a path that no longer exists —
// one containing the Windows extended-length `\\?\` prefix, which it cannot
// parse. The watcher emits an unhandled 'error' and takes the process with it:
//
//   Error: UNKNOWN: unknown error, lstat
//   '...\node_modules\@expo\.spawn-async-0ow2a7Wx\build\?\C:\...'
//
// Excluding those transient directories from the watch list avoids it. Nothing
// inside them is ever imported, so there is nothing to lose by not watching.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  // Expo CLI's temporary spawn directories (the crash above).
  /node_modules[\\/]@expo[\\/]\.spawn-async-.*/,
  // Never bundle the API or the agent console into the mobile app: they are
  // separate projects that happen to live in the same folder.
  /backend[\\/].*/,
  /admin-web[\\/].*/,
];

module.exports = config;
