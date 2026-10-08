// The one place the app talks to the network.
//
// Handles: base URL, auth header, 401 -> refresh -> retry (once, and only one
// refresh in flight at a time), timeouts, and turning API errors into something
// the UI can branch on by `code` rather than by parsing English.

import { API_URL } from './config.js';
import { loadSession, saveSession, clearSession, peekSession } from './session.js';

const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

let onSessionLost = () => {};
export const setSessionLostHandler = (fn) => { onSessionLost = fn; };

// If three screens all 401 at once they must not fire three refreshes and
// invalidate each other's rotated token — the backend treats a reused refresh
// token as theft and kills every session. One promise, shared.
let refreshing = null;

async function doRefresh() {
  const session = await loadSession();
  if (!session?.refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return false;
    await saveSession(await res.json());
    return true;
  } catch {
    return false;
  }
}

function refreshOnce() {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request(method, path, { body, auth = true, retry = true, signal, headers: extra } = {}) {
  const headers = { Accept: 'application/json', ...extra };
  if (body) headers['Content-Type'] = 'application/json';

  if (auth) {
    const session = peekSession() ?? (await loadSession());
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(
      err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      err.name === 'AbortError' ? 'The server took too long' : 'Cannot reach the server',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && auth && retry) {
    const ok = await refreshOnce();
    if (ok) return request(method, path, { body, auth, retry: false, signal, headers: extra });
    await clearSession();
    onSessionLost();
  }

  if (res.status === 304) return null; // catalog unchanged

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? res.statusText,
      res.status,
      json?.error?.details,
    );
  }
  return json;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export const api = {
  // auth
  register: (payload) => request('POST', '/auth/register', { body: payload, auth: false }),
  login: (username, password) =>
    request('POST', '/auth/login', { body: { username, password }, auth: false }),
  logout: (refreshToken) =>
    request('POST', '/auth/logout', { body: { refreshToken }, auth: false }),
  // Explicit refresh, used after approval to swap an onboarding-scoped token for
  // a full-scope one before entering the app.
  refresh: (refreshToken) =>
    request('POST', '/auth/refresh', { body: { refreshToken }, auth: false }),
  me: () => request('GET', '/me'),

  // onboarding
  myRequest: () => request('GET', '/account-requests/mine'),

  // catalog — public, so no token needed and no 401 dance
  catalog: () => request('GET', '/catalog', { auth: false }),
  product: (id) => request('GET', `/products/${id}`, { auth: false }),
};

export { request };
