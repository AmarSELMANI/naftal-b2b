// Document storage, behind one interface so the driver can change without the
// onboarding code noticing.
//
// These files are ID cards, bank statements and trade registers. The single
// non-negotiable property is that they are never publicly readable (§6), so
// neither driver exposes a static path: bytes only ever leave through an
// authenticated, role-checked route that streams them.
//
//   local — written under backend/.uploads/, which is gitignored. Fine for
//           development; wrong for Fly, where the filesystem is per-machine
//           and discarded on every deploy.
//   r2    — Cloudflare R2, a PRIVATE bucket. R2 speaks the S3 API, so this is
//           the AWS SDK pointed at an R2 endpoint.
//
// Selected by whether R2 credentials are present, so adding them to the
// environment is the entire migration — no code path changes.

import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const UPLOAD_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.uploads');

export const driver = env.R2_ACCESS_KEY_ID ? 'r2' : 'local';

// The client is built once, lazily, and only when R2 is actually selected —
// importing the SDK costs ~100 ms of startup that a local run should not pay.
let clientPromise = null;
async function r2() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { S3Client } = await import('@aws-sdk/client-s3');
      return new S3Client({
        // R2 has no regions; the SDK still insists on a value.
        region: 'auto',
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
    })();
  }
  return clientPromise;
}

/** Opaque key — never the user's filename, which is attacker-controlled. */
export function makeStorageKey({ companyId, kind, fileName }) {
  const ext = extname(fileName || '').slice(0, 10).replace(/[^.A-Za-z0-9]/g, '');
  return `documents/${companyId}/${kind}-${randomUUID()}${ext}`;
}

export async function putObject(storageKey, buffer, contentType) {
  if (driver === 'r2') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await r2();
    await client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_DOCUMENTS,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }));
    return storageKey;
  }

  const target = join(UPLOAD_ROOT, storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return storageKey;
}

/**
 * Stream for the authenticated download route.
 *
 * Async even for the local driver, which could return synchronously: one
 * signature for both means the caller never has to know which is active.
 */
export async function getObjectStream(storageKey) {
  if (driver === 'r2') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await r2();
    const res = await client.send(new GetObjectCommand({
      Bucket: env.R2_BUCKET_DOCUMENTS,
      Key: storageKey,
    }));
    return res.Body; // a Node Readable under Node's SDK v3 runtime
  }

  // access() first: createReadStream does NOT throw for a missing file, it
  // emits 'error' asynchronously — by which point the 200 and the headers have
  // already gone out and the client receives an empty body with no error. That
  // is how a wiped upload directory looked like "nothing happens" in the
  // console instead of a failure.
  const path = join(UPLOAD_ROOT, storageKey);
  await access(path);
  return createReadStream(path);
}

export async function deleteObject(storageKey) {
  if (driver === 'r2') {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await r2();
    await client.send(new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_DOCUMENTS,
      Key: storageKey,
    })).catch(() => {}); // a missing object is not an error worth propagating
    return;
  }

  await unlink(join(UPLOAD_ROOT, storageKey)).catch(() => {});
}

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB
