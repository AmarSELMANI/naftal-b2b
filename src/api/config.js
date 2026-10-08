// Where the API lives.
//
// The awkward part of Expo development: `localhost` on a physical phone means
// the phone itself, not your laptop. Rather than hardcoding a LAN IP that
// changes every time you join a different network, derive it from the Expo dev
// server's own host — the phone already reached your laptop to load the bundle,
// so that address is known to be correct.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3100; // 3000 is taken by AdGuard Home on the dev machine

function devHost() {
  // e.g. "192.168.100.75:8081" — the machine serving the Expo bundle
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host) return host;

  // Android emulators reach the host machine through a special address.
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost';
}

/** Overridable for a real deployment: set EXPO_PUBLIC_API_URL in the env. */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || `http://${devHost()}:${API_PORT}/v1`;

export const ASSET_BASE = API_URL.replace(/\/v1$/, '');

/**
 * Seeded image_url values point at whatever PUBLIC_ASSET_BASE_URL was when the
 * database was seeded — usually `localhost`, which a phone cannot resolve.
 * Rewriting the host here means the phone works without re-seeding.
 */
export function resolveImageUrl(url) {
  if (!url) return null;
  return url.replace(/^https?:\/\/[^/]+/, ASSET_BASE);
}
