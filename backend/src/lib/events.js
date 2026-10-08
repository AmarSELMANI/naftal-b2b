// In-process event bus, used only to push an approval decision to a waiting
// SSE connection so Wait.js advances the instant an agent clicks approve.
//
// Honest limitation: this works because the API runs as ONE process. With two
// instances, an approval handled by instance A would not reach a phone holding
// an SSE connection to instance B. The scale-out path is Postgres
// LISTEN/NOTIFY (no new infrastructure, since the database is already shared) —
// worth knowing, not worth building for one Fly machine. The client also polls
// as a fallback, so a missed event delays the screen, never breaks it.

import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
// One listener per waiting applicant; the default cap of 10 would warn in a demo.
bus.setMaxListeners(0);

export const CHANNEL = {
  accountDecision: (companyId) => `account:${companyId}`,
};

export function publishAccountDecision(companyId, payload) {
  bus.emit(CHANNEL.accountDecision(companyId), payload);
}
