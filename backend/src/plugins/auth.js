// Auth guards, as Fastify decorators.
//
// Three layers, each a separate decision:
//   authenticate          — is this a valid token?
//   requireScope(FULL)    — is the account past onboarding?
//   requireRole('admin')  — is this person Naftal staff?
//
// Keeping the onboarding gate in ONE place is the point: a pending applicant
// must not reach the catalog or orders, and scattering that check across routes
// is how one route eventually forgets it. §6

import fp from 'fastify-plugin';
import { verifyAccessToken, SCOPE } from '../lib/tokens.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export default fp(async function authPlugin(app) {
  /** Verifies the bearer token and attaches `req.auth`. No DB round trip. */
  app.decorate('authenticate', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('MISSING_TOKEN', 'Authorization: Bearer <token> required');
    }

    try {
      const claims = verifyAccessToken(header.slice(7));
      req.auth = {
        userId: claims.sub,
        companyId: claims.companyId,
        role: claims.role,
        scope: claims.scope,
      };
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      throw unauthorized(
        expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        expired ? 'Access token expired — refresh it' : 'Access token is not valid',
      );
    }
  });

  /**
   * Full access: the company is approved (or the user is staff). An applicant
   * still waiting gets ACCOUNT_PENDING, which the app turns into the Wait screen
   * rather than a generic error.
   */
  app.decorate('requireFullScope', async (req) => {
    await app.authenticate(req);
    if (req.auth.scope !== SCOPE.FULL) {
      throw forbidden('ACCOUNT_PENDING', 'This account is not approved yet');
    }
  });

  /** Naftal staff only. `agent` reviews; `admin` additionally sets policy. */
  app.decorate('requireRole', (...roles) => async (req) => {
    await app.authenticate(req);
    if (!roles.includes(req.auth.role)) {
      throw forbidden('FORBIDDEN', `Requires role: ${roles.join(' or ')}`);
    }
  });
});
