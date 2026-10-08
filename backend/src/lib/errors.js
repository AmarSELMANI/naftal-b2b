// One error shape for the whole API:
//   { error: { code, message, details? } }
//
// The `code` is the contract. Clients localise from it (FR/EN) and must never
// string-match `message`, which stays English and developer-facing. See §4.1 of
// docs/BACKEND-DESIGN.md.

export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, msg, details) => new AppError(400, code, msg, details);
export const unauthorized = (code = 'UNAUTHORIZED', msg = 'Authentication required') =>
  new AppError(401, code, msg);
export const forbidden = (code = 'FORBIDDEN', msg = 'Not allowed') => new AppError(403, code, msg);
export const notFound = (code = 'NOT_FOUND', msg = 'Resource not found') => new AppError(404, code, msg);
export const conflict = (code, msg, details) => new AppError(409, code, msg, details);

// Codes the mobile app branches on. Every code here needs a matching string in
// both translation bundles (fr.json / en.json) — keep the two in sync.
export const CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_PENDING: 'ACCOUNT_PENDING',
  ACCOUNT_DENIED: 'ACCOUNT_DENIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  CREDIT_LIMIT_EXCEEDED: 'CREDIT_LIMIT_EXCEEDED',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
};

export function registerErrorHandler(app) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }

    // Fastify's own JSON-Schema validation failures
    if (err.validation) {
      return reply.code(400).send({
        error: {
          code: CODES.VALIDATION_FAILED,
          message: err.message,
          details: err.validation,
        },
      });
    }

    if (err.statusCode === 429) {
      return reply.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' },
      });
    }

    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: req.method + ' ' + req.url + ' does not exist',
      },
    });
  });
}
