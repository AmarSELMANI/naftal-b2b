// Auth business rules. No Fastify objects in here — this file is unit-testable.

import argon2 from 'argon2';
import { AppError, CODES, unauthorized, conflict } from '../../lib/errors.js';
import {
  signAccessToken,
  newRefreshToken,
  hashToken,
  refreshExpiry,
  SCOPE,
} from '../../lib/tokens.js';
import { creditTermsFor } from '../../lib/settings.js';

// argon2id: memory-hard, so a stolen database cannot be cracked at GPU speed
// the way bcrypt hashes can. These are the parameters, stated explicitly rather
// than left to a default that could change under us.
const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP's current floor
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (plain) => argon2.hash(plain, ARGON_OPTS);
export const verifyPassword = (hash, plain) => argon2.verify(hash, plain);

/** Usernames and emails are normalised, so casing can never split an identity. */
const norm = (s) => (s ? String(s).trim().toLowerCase() : null);

/** A company that is not `approved` only ever gets an onboarding-scoped token. */
const scopeFor = (user) => {
  if (user.role !== 'customer') return SCOPE.FULL; // Naftal staff
  return user.company?.approvalStatus === 'approved' ? SCOPE.FULL : SCOPE.ONBOARDING;
};

async function issueTokens(prisma, user) {
  const scope = scopeFor(user);
  const raw = newRefreshToken();

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: refreshExpiry() },
  });

  return {
    accessToken: signAccessToken({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      scope,
    }),
    refreshToken: raw,
    scope,
  };
}

/** Shape returned to the app on login / register / me. */
export async function publicIdentity(prisma, user) {
  const company = user.company
    ? {
        id: user.company.id,
        name: user.company.name,
        approvalStatus: user.company.approvalStatus,
        ...(user.company.approvalStatus === 'approved'
          ? await creditTermsFor(prisma, user.company)
          : {}),
      }
    : null;

  return {
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    company,
  };
}

// ---------------------------------------------------------------------------

export async function register(prisma, input) {
  const username = norm(input.username);
  const email = norm(input.email);

  // Checked up front so the applicant hears "that username is taken" now rather
  // than after a two-day review. §3.1
  const clash = await prisma.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true, email: true },
  });
  if (clash) {
    if (clash.username === username) {
      throw conflict(CODES.USERNAME_TAKEN, 'That username is already registered');
    }
    throw conflict(CODES.EMAIL_TAKEN, 'That email address is already registered');
  }

  const passwordHash = await hashPassword(input.password);

  // Company + user are created pending, then the request row. Two statements
  // rather than one function: registration is a one-off action where ~0.5s is
  // invisible, unlike order placement. §5.11
  const company = await prisma.company.create({
    data: {
      name: input.enterpriseName,
      legalForm: input.enterpriseStatus ?? null,
      tradeRegisterNo: input.tradeRegisterNo ?? null,
      tin: input.tin ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email,
      approvalStatus: 'pending',
      users: {
        create: {
          username,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone ?? null,
          role: 'customer',
        },
      },
    },
    include: { users: true },
  });

  const user = company.users[0];

  const request = await prisma.accountRequest.create({
    data: {
      companyId: company.id,
      submittedById: user.id,
      termsAcceptedAt: new Date(),
      status: 'pending',
    },
  });

  const tokens = await issueTokens(prisma, { ...user, company });

  return {
    ...tokens,
    ...(await publicIdentity(prisma, { ...user, company })),
    accountRequestId: request.id,
  };
}

export async function login(prisma, { username, password }) {
  const user = await prisma.user.findUnique({
    where: { username: norm(username) },
    include: { company: true },
  });

  // Same error and a comparable amount of work whether the user exists or not,
  // so the response cannot be used to enumerate usernames.
  if (!user) {
    await argon2.hash('timing-equaliser', ARGON_OPTS);
    throw unauthorized(CODES.INVALID_CREDENTIALS, 'Wrong username or password');
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw unauthorized(CODES.INVALID_CREDENTIALS, 'Wrong username or password');

  if (!user.isActive) {
    throw new AppError(403, CODES.ACCOUNT_SUSPENDED, 'This account has been deactivated');
  }

  // A pending or denied applicant still logs in successfully — they get an
  // onboarding-scoped token so the app can show them the Wait screen and the
  // decision. Returning an error here would leave Wait.js with nothing to poll.
  const tokens = await issueTokens(prisma, user);

  prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {}); // never make the user wait on a bookkeeping write

  return { ...tokens, ...(await publicIdentity(prisma, user)) };
}

export async function refresh(prisma, rawToken) {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { include: { company: true } } },
  });

  if (!existing) throw unauthorized('INVALID_REFRESH_TOKEN', 'Unknown refresh token');

  // A token that was already used is either a replay or a stolen token being
  // tried after the real client rotated it. Either way the safe response is to
  // kill every session for that user and make them log in again.
  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('REFRESH_TOKEN_REUSED', 'Session revoked — please log in again');
  }

  if (existing.expiresAt < new Date()) {
    throw unauthorized('REFRESH_TOKEN_EXPIRED', 'Session expired — please log in again');
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokens(prisma, existing.user);
  return { ...tokens, ...(await publicIdentity(prisma, existing.user)) };
}

export async function logout(prisma, rawToken) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function me(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: true },
  });
  if (!user) throw unauthorized('USER_GONE', 'This user no longer exists');
  return publicIdentity(prisma, user);
}
