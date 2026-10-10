// Push registration.
//
// Two honest constraints, handled rather than hidden:
//
//   1. Push does not work in Expo Go on Android (SDK 53+) or on web. It needs a
//      development build on a physical device. Every path here fails soft and
//      returns a reason, so the app runs identically without it and you can see
//      WHY it did not register instead of guessing.
//
//   2. Registration happens while the account may still be pending, on purpose:
//      the single most valuable push in this system is "your account is
//      approved", and the applicant is by definition not approved when they
//      need to subscribe to it.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { request } from './client.js';
import { peekSession } from './session.js';

let cachedToken = null;

/**
 * True inside Expo Go, as opposed to a development build or a store build.
 *
 * This has to be checked BEFORE expo-notifications is imported, not after.
 * Since SDK 53 the library runs a side-effect module at import time that
 * registers a push-token listener, and that listener throws immediately in
 * Expo Go. A try/catch around the call site cannot help: the throw happens
 * while the module is being evaluated, and it surfaced as a red screen on top
 * of the registration form — a push nicety breaking account creation.
 */
const isExpoGo =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

/** Lazy import: expo-notifications is heavy, and unusable on web or in Expo Go. */
async function loadNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Ask for permission, get the Expo token, register it with the API.
 * Returns { ok: true, token } or { ok: false, reason }.
 */
export async function registerForPush({ language = 'fr' } = {}) {
  if (Platform.OS === 'web') return { ok: false, reason: 'web-unsupported' };
  if (isExpoGo) return { ok: false, reason: 'expo-go-unsupported' };
  if (!peekSession()?.accessToken) return { ok: false, reason: 'not-signed-in' };

  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, reason: 'module-unavailable' };

  try {
    const Device = await import('expo-device');
    if (!Device.isDevice) return { ok: false, reason: 'simulator' };

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      // Only ask if we have not been refused before; re-prompting a user who
      // said no is a dark pattern and iOS ignores it anyway.
      if (!existing.canAskAgain) return { ok: false, reason: 'permission-denied' };
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return { ok: false, reason: 'permission-denied' };

    // Android needs an explicit channel or notifications arrive silently.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Naftal',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#FFD600',
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    // Without an EAS project id getExpoPushTokenAsync throws in SDK 50+, so say
    // so plainly rather than surfacing a confusing stack trace.
    if (!projectId) return { ok: false, reason: 'no-eas-project-id' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return { ok: false, reason: 'no-token' };

    await request('POST', '/devices', {
      body: { token, platform: Platform.OS, language },
    });

    cachedToken = token;
    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: 'error', error: String(err?.message ?? err) };
  }
}

/** Called on logout, so the next person on this phone gets nothing of theirs. */
export async function unregisterPush() {
  if (!cachedToken) return;
  try {
    await request('DELETE', '/devices', { body: { token: cachedToken } });
  } catch { /* logging out must never be blocked by this */ }
  cachedToken = null;
}

/** Keep the stored language in step with the in-app toggle. */
export async function updatePushLanguage(language) {
  if (!cachedToken) return;
  try {
    await request('POST', '/devices', {
      body: { token: cachedToken, platform: Platform.OS, language },
    });
  } catch { /* cosmetic */ }
}
