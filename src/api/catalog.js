// Catalog hooks.
//
// The backend ships the entire catalog in one cached, ETagged request (§5.1), so
// the app fetches it ONCE and then navigates category -> brand -> product with
// zero further network calls. That is why browsing feels instant even though a
// database round trip from here costs ~238ms.

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from './client.js';
import { resolveImageUrl } from './config.js';

export const CATALOG_KEY = ['catalog'];

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => api.catalog(),
    // Matches the server's own 60s cache. Longer would show stale stock badges;
    // shorter would waste requests the server would answer with a 304 anyway.
    staleTime: 60_000,
    gcTime: 24 * 60 * 60 * 1000, // keep it for offline navigation
    retry: 2,
  });
}

/** Walk the tree to a category by slug — the tree is tiny, so this is free. */
function findCategory(nodes, slug) {
  for (const n of nodes ?? []) {
    if (n.slug === slug) return n;
    const hit = findCategory(n.children, slug);
    if (hit) return hit;
  }
  return null;
}

/** Top-level categories, for the main menu and the Tires screen. */
export function useCategories(parentSlug = null) {
  const q = useCatalog();
  const categories = useMemo(() => {
    if (!q.data) return [];
    if (!parentSlug) return q.data.categories;
    return findCategory(q.data.categories, parentSlug)?.children ?? [];
  }, [q.data, parentSlug]);
  return { ...q, categories };
}

/** Brands carried in one category, each with its product count. */
export function useBrands(categorySlug) {
  const q = useCatalog();
  const brands = useMemo(() => {
    const cat = findCategory(q.data?.categories, categorySlug);
    return cat?.brands ?? [];
  }, [q.data, categorySlug]);
  return { ...q, brands, category: findCategory(q.data?.categories, categorySlug) };
}

/** Products of one brand within one category, images already host-corrected. */
export function useBrandProducts(categorySlug, brandSlug) {
  const q = useCatalog();
  const { brand, products } = useMemo(() => {
    const cat = findCategory(q.data?.categories, categorySlug);
    const b = cat?.brands?.find((x) => x.slug === brandSlug) ?? null;
    return {
      brand: b,
      products: (b?.products ?? []).map((p) => ({
        ...p,
        imageUrl: resolveImageUrl(p.imageUrl),
      })),
    };
  }, [q.data, categorySlug, brandSlug]);
  return { ...q, brand, products };
}

/**
 * Live product detail, used by the detail screen because it needs the exact
 * stock quantity to validate a requested quantity against. The catalog's
 * `inStock` boolean is allowed to be up to 60s stale; this is not cached.
 */
export function useProduct(id) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const p = await api.product(id);
      return { ...p, imageUrl: resolveImageUrl(p.imageUrl) };
    },
    enabled: !!id,
    staleTime: 0,
    retry: 1,
  });
}
