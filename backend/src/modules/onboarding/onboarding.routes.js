// Onboarding: upload the 5 documents, then watch for the decision.
//
// These routes are the only ones an onboarding-scoped token can reach. §6

import { notFound, badRequest, forbidden } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { bus, CHANNEL } from '../../lib/events.js';
import {
  makeStorageKey, putObject, ALLOWED_MIME, MAX_DOCUMENT_BYTES, driver,
} from '../../lib/storage.js';

const DOCUMENT_KINDS = [
  'id_card',
  'proof_of_address',
  'business_registration',
  'tin',
  'bank_statement',
];

/** The applicant's own latest request, or 404. Never anyone else's. */
async function ownRequest(app, req) {
  const r = await app.prisma.accountRequest.findFirst({
    where: { companyId: req.auth.companyId },
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { name: true, approvalStatus: true } },
      documents: { select: { kind: true, fileName: true, uploadedAt: true } },
    },
  });
  if (!r) throw notFound('NO_ACCOUNT_REQUEST', 'You have no account request on file');
  return r;
}

const statusPayload = (r) => ({
  id: r.id,
  status: r.status,
  companyName: r.company.name,
  approvalStatus: r.company.approvalStatus,
  denialReason: r.denialReason,
  decidedAt: r.decidedAt,
  submittedAt: r.createdAt,
  requiredDocuments: DOCUMENT_KINDS,
  uploadedDocuments: r.documents.map((d) => d.kind),
  missingDocuments: DOCUMENT_KINDS.filter((k) => !r.documents.some((d) => d.kind === k)),
});

export default async function onboardingRoutes(app) {
  // What Wait.js polls as its fallback.
  app.get(
    '/account-requests/mine',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['onboarding'],
        summary: 'My account request status',
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => statusPayload(await ownRequest(app, req)),
  );

  /**
   * Server-Sent Events: the decision arrives the moment an agent clicks
   * approve, so the demo is "watch the phone while I approve this". SSE rather
   * than WebSocket because the traffic is one-directional and SSE reconnects
   * by itself.
   */
  app.get(
    '/account-requests/mine/stream',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['onboarding'],
        summary: 'Live decision stream (SSE)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const current = await ownRequest(app, req);
      const companyId = req.auth.companyId;

      // CORS has to be set by hand here. Writing to `reply.raw` sends headers
      // straight to the socket and skips Fastify's onSend hooks -- which is
      // where @fastify/cors adds Access-Control-Allow-Origin. Without this the
      // browser blocks the stream outright and the client silently falls back
      // to polling, turning an instant decision into a 5-second one.
      const origin = req.headers.origin;
      const corsHeaders = {};
      if (origin && (env.corsOrigins.length === 0 || env.corsOrigins.includes(origin))) {
        corsHeaders['Access-Control-Allow-Origin'] = origin;
        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
        corsHeaders.Vary = 'Origin';
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // stop any proxy from buffering the stream
        ...corsHeaders,
      });

      const send = (event, data) => {
        if (reply.raw.writableEnded) return;
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Send current state immediately, so a client that connects after the
      // decision was made still gets it and never hangs waiting.
      send('status', statusPayload(current));

      const onDecision = (payload) => {
        send('decision', payload);
        clearInterval(keepAlive);
        reply.raw.end();
      };
      bus.on(CHANNEL.accountDecision(companyId), onDecision);

      // Comment frames keep idle proxies and mobile radios from dropping it.
      const keepAlive = setInterval(() => {
        if (!reply.raw.writableEnded) reply.raw.write(': ping\n\n');
      }, 20_000);

      req.raw.on('close', () => {
        clearInterval(keepAlive);
        bus.off(CHANNEL.accountDecision(companyId), onDecision);
      });

      return reply;
    },
  );

  /**
   * Upload one document.
   *
   * Local driver: multipart straight to this route. R2 driver (once credentials
   * exist): the phone PUTs to a presigned URL and only confirms metadata here,
   * so file bytes never pass through the API. §4
   */
  app.post(
    '/account-requests/:id/documents',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['onboarding'],
        summary: 'Upload one of the 5 required documents (multipart)',
        consumes: ['multipart/form-data'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req) => {
      const request = await ownRequest(app, req);
      if (request.id !== req.params.id) {
        throw forbidden('NOT_YOUR_REQUEST', 'That account request is not yours');
      }
      if (request.status !== 'pending') {
        throw badRequest('REQUEST_CLOSED', 'This request has already been decided');
      }

      const file = await req.file({ limits: { fileSize: MAX_DOCUMENT_BYTES } });
      if (!file) throw badRequest('NO_FILE', 'Expected a multipart file field');

      const kind = file.fields?.kind?.value;
      if (!DOCUMENT_KINDS.includes(kind)) {
        throw badRequest('INVALID_DOCUMENT_KIND', `kind must be one of: ${DOCUMENT_KINDS.join(', ')}`);
      }
      if (!ALLOWED_MIME.has(file.mimetype)) {
        throw badRequest('UNSUPPORTED_FILE_TYPE', 'Upload a PDF, JPEG, PNG or WebP');
      }

      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw badRequest('FILE_TOO_LARGE', 'Maximum document size is 8 MB');
      }

      const storageKey = makeStorageKey({
        companyId: req.auth.companyId,
        kind,
        fileName: file.filename,
      });
      await putObject(storageKey, buffer, file.mimetype);

      // Re-uploading a kind replaces it, so a wrong scan is fixable without
      // leaving two competing copies for the agent to choose between.
      const doc = await app.prisma.document.upsert({
        where: { accountRequestId_kind: { accountRequestId: request.id, kind } },
        update: {
          storageKey,
          fileName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: buffer.length,
          uploadedAt: new Date(),
        },
        create: {
          accountRequestId: request.id,
          kind,
          storageKey,
          fileName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: buffer.length,
        },
      });

      const after = await ownRequest(app, req);
      return {
        uploaded: { kind: doc.kind, fileName: doc.fileName, sizeBytes: doc.sizeBytes },
        storageDriver: driver,
        missingDocuments: statusPayload(after).missingDocuments,
      };
    },
  );
}
