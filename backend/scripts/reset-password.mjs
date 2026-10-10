// Resets one user's password.
//
// The seed deliberately never overwrites an existing admin password — re-seeding
// must not silently hand out a new credential. That leaves one gap: an account
// created during development keeps its development password forever, including
// after the database is pointed at a deployed app. This closes it.
//
// Passwords are argon2id, so this cannot be done with SQL. It reuses
// hashPassword from the auth service rather than re-deriving the parameters,
// because a hash written with different settings would still verify and would
// quietly weaken that one account.
//
//   node --env-file=.env scripts/reset-password.mjs admin
//   node --env-file=.env scripts/reset-password.mjs admin --password "…"
//
// On Fly (no .env file; the environment is already populated):
//   fly ssh console -C "node /app/backend/scripts/reset-password.mjs admin"
//
// With no --password a strong one is generated and printed once.

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/auth.service.js';

const args = process.argv.slice(2);
const username = args.find((a) => !a.startsWith('--'));
const pwIndex = args.indexOf('--password');
const supplied = pwIndex !== -1 ? args[pwIndex + 1] : null;

if (!username) {
  console.error('Usage: node scripts/reset-password.mjs <username> [--password "…"]');
  process.exit(1);
}
if (supplied !== null && (!supplied || supplied.startsWith('--') || supplied.length < 12)) {
  console.error('--password needs at least 12 characters.');
  process.exit(1);
}

const password = supplied || randomBytes(12).toString('base64url');
const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, username: true, role: true },
  });

  if (!user) {
    console.error(`No user named "${username}".`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });

  // Every existing session for this user dies with the old password. If the
  // reason for the reset is a leak, leaving refresh tokens alive would let the
  // holder keep rotating a session indefinitely.
  const { count } = await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  console.log(`\n  Password reset for "${user.username}" (${user.role}).`);
  console.log(`  ${count} refresh token(s) revoked — existing sessions are dead.`);
  if (!supplied) {
    console.log('\n  New password (shown once):\n');
    console.log('      ' + password + '\n');
  }
} finally {
  await prisma.$disconnect();
}
