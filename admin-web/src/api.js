// API client for the agent console.
//
// Tokens live in sessionStorage, not localStorage: an agent reviewing ID cards
// and bank statements should not leave a session behind in a browser that gets
// closed and reopened by someone else.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3100/v1';

const KEY = 'naftal.admin.session';

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(s) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}

/** Errors carry the API's machine-readable code so the UI localises, not parses. */
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let onAuthLost = () => {};
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

async function request(method, path, body) {
  const session = loadSession();
  const headers = {};
  if (session?.accessToken) headers.Authorization = 'Bearer ' + session.accessToken;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('NETWORK', 'API unreachable', 0);
  }

  if (res.status === 401) {
    // One retry through the refresh token before giving up on the session.
    const refreshed = await tryRefresh();
    if (refreshed) return request(method, path, body);
    clearSession();
    onAuthLost();
    throw new ApiError('UNAUTHORIZED', 'Session expired', 401);
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(json?.error?.code || 'UNKNOWN', json?.error?.message || res.statusText, res.status);
  }
  return json;
}

async function tryRefresh() {
  const session = loadSession();
  if (!session?.refreshToken) return false;
  try {
    const res = await fetch(BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return false;
    saveSession(await res.json());
    return true;
  } catch {
    return false;
  }
}

export const api = {
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  requests: (status) => request('GET', '/admin/account-requests' + (status ? `?status=${status}` : '')),
  request: (id) => request('GET', `/admin/account-requests/${id}`),
  approve: (id) => request('POST', `/admin/account-requests/${id}/approve`),
  deny: (id, reason) => request('POST', `/admin/account-requests/${id}/deny`, { reason }),
  settings: () => request('GET', '/admin/settings'),
  orders: (query = '') => request('GET', '/admin/orders' + query),
  confirmPayment: (id) => request('POST', `/admin/payments/${id}/confirm`),
  rejectPayment: (id) => request('POST', `/admin/payments/${id}/reject`),
};

/**
 * Documents are never public, so an <img src> cannot fetch one. Pull the bytes
 * with the auth header and hand back a blob URL for display.
 */
export async function fetchDocument(downloadPath) {
  const session = loadSession();
  const res = await fetch(
    downloadPath.startsWith('http') ? downloadPath : BASE.replace(/\/v1$/, '') + downloadPath,
    { headers: { Authorization: 'Bearer ' + session.accessToken } },
  );
  if (!res.ok) {
    // Use the API's own error code when it sent one, so a file that is missing
    // from storage reads differently from a permission problem. Falling back to
    // a generic code would tell the agent nothing actionable.
    let code = 'DOCUMENT_UNAVAILABLE';
    try {
      const body = await res.json();
      if (body?.error?.code) code = body.error.code;
    } catch { /* not JSON; keep the generic code */ }
    throw new ApiError(code, 'Could not load document', res.status);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}
