// Tokens.
//
// Access tokens are stateless JWTs with a 15-minute life, so authenticating a
// request costs **no database round trip** — which matters more here than usual,
// because a round trip to Neon is ~238ms (§5.11).
//
// Refresh tokens are the opposite: long-lived, single-use, and stored. Only a
// SHA-256 of the token is persisted, so a database dump does not hand anyone a
// working session.

import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Token scopes.
 *   full       — an approved customer, or Naftal staff. Everything their role allows.
 *   onboarding — an applicant whose company is pending or denied. Can reach
 *                exactly their own request status and nothing else. §6
 */
export const SCOPE = { FULL: 'full', ONBOARDING: 'onboarding' };

export function signAccessToken({ userId, companyId, role, scope }) {
  return jwt.sign(
    { sub: userId, companyId: companyId ?? null, role, scope },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/** Opaque random string — a refresh token carries no claims of its own. */
export function newRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');

export function refreshExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return d;
}
