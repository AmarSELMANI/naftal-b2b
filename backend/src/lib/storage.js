// Document storage, behind one interface so the driver can change without the
// onboarding code noticing.
//
// These files are ID cards, bank statements and trade registers. The single
// non-negotiable property is that they are never publicly readable (§6), so
// neither driver exposes a static path: bytes only ever leave through an
// authenticated, role-checked route that streams them.
//
//   local (now) — written under backend/.uploads/, which is gitignored.
//   r2 (later)  — Cloudflare R2 private bucket + presigned PUT, so the phone
//                 uploads directly and the API never proxies file bytes.
//
// Selected by whether R2 credentials are present, so adding them to .env is the
// entire migration.

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const UPLOAD_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.uploads');

export const driver = env.R2_ACCESS_KEY_ID ? 'r2' : 'local';

/** Opaque key — never the user's filename, which is attacker-controlled. */
export function makeStorageKey({ companyId, kind, fileName }) {
  const ext = extname(fileName || '').slice(0, 10).replace(/[^.A-Za-z0-9]/g, '');
  return `documents/${companyId}/${kind}-${randomUUID()}${ext}`;
}

export async function putObject(storageKey, buffer) {
  if (driver === 'r2') {
    throw new Error('R2 driver not wired yet — add R2_* to .env and implement putObject');
  }
  const target = join(UPLOAD_ROOT, storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return storageKey;
}

/** Stream for the authenticated download route. */
export function getObjectStream(storageKey) {
  if (driver === 'r2') {
    throw new Error('R2 driver not wired yet');
  }
  return createReadStream(join(UPLOAD_ROOT, storageKey));
}

export async function deleteObject(storageKey) {
  if (driver === 'local') {
    await unlink(join(UPLOAD_ROOT, storageKey)).catch(() => {});
  }
}

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB
