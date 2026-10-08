// Orders and credit.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from './client.js';
import { CATALOG_KEY } from './catalog.js';
import { resolveImageUrl } from './config.js';

const ordersApi = {
  list: (cursor) => request('GET', '/orders' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')),
  get: (id) => request('GET', `/orders/${id}`),
  credit: () => request('GET', '/credit'),
  declarePayment: (id, body) => request('POST', `/orders/${id}/payments`, { body }),
  cancel: (id) => request('POST', `/orders/${id}/cancel`),
};

const withImages = (order) => ({
  ...order,
  items: order.items.map((i) => ({ ...i, imageUrl: resolveImageUrl(i.imageUrl) })),
});

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await ordersApi.list();
      return { ...res, items: res.items.map(withImages) };
    },
    staleTime: 30_000,
  });
}

/** Ceiling, outstanding and what is left — read before offering credit. */
export function useCredit() {
  return useQuery({
    queryKey: ['credit'],
    queryFn: () => ordersApi.credit(),
    staleTime: 30_000,
  });
}

/**
 * Place an order.
 *
 * The Idempotency-Key is generated ONCE per checkout attempt and reused across
 * retries, so a dropped response plus a second tap cannot produce two orders.
 * Generating it inside the mutation function would defeat the entire point.
 */
export function usePlaceOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ items, paymentType, idempotencyKey }) =>
      request('POST', '/orders', {
        body: { items, paymentType },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      // Stock moved and credit moved, so anything showing either is now stale.
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
      qc.invalidateQueries({ queryKey: CATALOG_KEY });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

export function useDeclarePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, method, reference }) =>
      ordersApi.declarePayment(orderId, { method, reference }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
    },
  });
}

/** Colour for the deadline, driven by the server's `urgency`, not by local date maths. */
export const URGENCY_COLOUR = {
  ok: '#1a7f46',
  soon: '#b26a00',
  overdue: '#b3261e',
};
