// Token storage.
//
// Tokens are credentials, so they go in expo-secure-store (Keychain on iOS,
// EncryptedSharedPreferences on Android), not AsyncStorage, which is plain
// unencrypted files any other process on a rooted device can read.
//
// SecureStore has no web implementation, so the web build falls back to
// localStorage — acceptable there because the browser already sandboxes by
// origin, and the alternative is the app simply not running on web.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'naftal.session';

const isWeb = Platform.OS === 'web';

async function readRaw() {
  if (isWeb) {
    try { return window.localStorage.getItem(KEY); } catch { return null; }
  }
  return SecureStore.getItemAsync(KEY);
}

async function writeRaw(value) {
  if (isWeb) {
    try { window.localStorage.setItem(KEY, value); } catch { /* private mode */ }
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function deleteRaw() {
  if (isWeb) {
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

// Kept in memory too, so the request path never awaits disk on every call.
let cached;

export async function loadSession() {
  if (cached !== undefined) return cached;
  const raw = await readRaw();
  try {
    cached = raw ? JSON.parse(raw) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveSession(session) {
  cached = session;
  await writeRaw(JSON.stringify(session));
}

export async function clearSession() {
  cached = null;
  await deleteRaw();
}

export const peekSession = () => cached ?? null;
