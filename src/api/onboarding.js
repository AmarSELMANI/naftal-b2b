// Onboarding: submitting a request, uploading its documents, and watching for
// the decision.

import EventSource from 'react-native-sse';
import { API_URL } from './config.js';
import { peekSession, loadSession } from './session.js';
import { request, ApiError } from './client.js';

export const DOCUMENT_KINDS = [
  'id_card',
  'proof_of_address',
  'business_registration',
  'tin',
  'bank_statement',
];

/**
 * Upload one document as multipart.
 *
 * Not routed through `request()` because that JSON-encodes bodies; FormData has
 * to go through fetch untouched, and setting Content-Type by hand would drop the
 * multipart boundary React Native generates.
 */
export async function uploadDocument({ accountRequestId, kind, file }) {
  const session = peekSession() ?? (await loadSession());

  const form = new FormData();
  form.append('kind', kind);
  form.append('file', {
    uri: file.uri,
    name: file.name || `${kind}.pdf`,
    type: file.mimeType || 'application/octet-stream',
  });

  const res = await fetch(`${API_URL}/account-requests/${accountRequestId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: form,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }

  if (!res.ok) {
    throw new ApiError(json?.error?.code ?? 'UNKNOWN', json?.error?.message ?? res.statusText, res.status);
  }
  return json;
}

export const myRequest = () => request('GET', '/account-requests/mine');

/**
 * Watch for the approval decision.
 *
 * SSE is the fast path — the agent clicks approve and this fires immediately.
 * Polling is the fallback, because a dropped mobile connection, a proxy that
 * buffers, or a second API instance (the event bus is per-process, §11) would
 * each cost the event. Losing it should delay the screen, never freeze it.
 *
 * Returns an unsubscribe function.
 */
export function watchDecision({ onStatus, onDecision, onError }) {
  const session = peekSession();
  if (!session?.accessToken) {
    onError?.(new ApiError('UNAUTHORIZED', 'No session', 401));
    return () => {};
  }

  let closed = false;
  let es = null;
  let pollTimer = null;

  const finish = (payload) => {
    if (closed) return;
    closed = true;
    cleanup();
    onDecision(payload);
  };

  const poll = async () => {
    if (closed) return;
    try {
      const r = await myRequest();
      onStatus?.(r);
      if (r.status !== 'pending') {
        finish({ status: r.status, approvalStatus: r.approvalStatus, denialReason: r.denialReason });
      }
    } catch (err) {
      onError?.(err);
    }
  };

  const cleanup = () => {
    if (es) { try { es.removeAllEventListeners?.(); es.close(); } catch { /* already gone */ } es = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  };

  try {
    es = new EventSource(`${API_URL}/account-requests/mine/stream`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      pollingInterval: 0, // we run our own fallback; don't let it auto-reconnect forever
    });

    es.addEventListener('status', (e) => {
      if (e.data) onStatus?.(JSON.parse(e.data));
    });

    es.addEventListener('decision', (e) => {
      if (e.data) finish(JSON.parse(e.data));
    });

    // Any transport problem just means the poll below carries the screen.
    es.addEventListener('error', () => {});
  } catch {
    es = null;
  }

  // Runs regardless of SSE health: one immediate check, then every 5s.
  poll();
  pollTimer = setInterval(poll, 5000);

  return () => { closed = true; cleanup(); };
}
