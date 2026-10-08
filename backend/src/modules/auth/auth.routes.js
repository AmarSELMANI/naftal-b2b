// Auth routes. Every body is validated by JSON Schema before a service sees it.

import * as svc from './auth.service.js';
import { env } from '../../config/env.js';

const identityResponse = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    scope: { type: 'string', enum: ['full', 'onboarding'] },
    accountRequestId: { type: 'string' },
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        role: { type: 'string' },
      },
    },
    company: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        approvalStatus: { type: 'string' },
        creditLimit: { type: 'number' },
        creditTermDays: { type: 'integer' },
      },
    },
  },
};

export default async function authRoutes(app) {
  // The registration form in Register.js, field for field.
  app.post(
    '/auth/register',
    {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_REGISTER_MAX,
          timeWindow: env.RATE_LIMIT_REGISTER_WINDOW,
        },
      },
      schema: {
        tags: ['auth'],
        summary: 'Submit an account request (creates a pending company)',
        body: {
          type: 'object',
          required: [
            'firstName', 'lastName', 'username', 'password',
            'enterpriseName', 'termsAccepted',
          ],
          properties: {
            firstName: { type: 'string', minLength: 1, maxLength: 80 },
            lastName: { type: 'string', minLength: 1, maxLength: 80 },
            username: { type: 'string', minLength: 3, maxLength: 40, pattern: '^[A-Za-z0-9._-]+$' },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            email: { type: 'string', format: 'email', maxLength: 160 },
            phone: { type: 'string', maxLength: 40 },
            enterpriseName: { type: 'string', minLength: 1, maxLength: 160 },
            enterpriseStatus: { type: 'string', maxLength: 80 },
            tradeRegisterNo: { type: 'string', maxLength: 80 },
            tin: { type: 'string', maxLength: 80 },
            address: { type: 'string', maxLength: 300 },
            // The checkbox is a legal record, not decoration: the acceptance
            // timestamp is stored on the request. const:true means a false value
            // is rejected by the schema, before any row is written.
            termsAccepted: { type: 'boolean', const: true },
          },
        },
        response: { 201: identityResponse },
      },
    },
    async (req, reply) => {
      const result = await svc.register(app.prisma, req.body);
      reply.code(201);
      return result;
    },
  );

  app.post(
    '/auth/login',
    {
      // Brute force protection. Tight, because a B2B app has few legitimate
      // login attempts and the accounts control a credit facility.
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_LOGIN_MAX,
          timeWindow: env.RATE_LIMIT_LOGIN_WINDOW,
        },
      },
      schema: {
        tags: ['auth'],
        summary: 'Log in — succeeds for pending accounts with an onboarding scope',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
          },
        },
        response: { 200: identityResponse },
      },
    },
    async (req) => svc.login(app.prisma, req.body),
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange a refresh token for a new pair (single use, rotating)',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
        response: { 200: identityResponse },
      },
    },
    async (req) => svc.refresh(app.prisma, req.body.refreshToken),
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke a refresh token',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
      },
    },
    async (req) => {
      await svc.logout(app.prisma, req.body.refreshToken);
      return { ok: true };
    },
  );

  // Deliberately reachable with an onboarding scope: the app calls this at boot
  // to decide which screen to show, including for a pending applicant.
  app.get(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Current user, company and credit terms',
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => svc.me(app.prisma, req.auth.userId),
  );
}
