import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { CatalogFilters, SaleId, SortOption } from '../types';

const DEFAULT_SORT: SortOption = 'recommended';

function parseList(raw: string | null): string[] {
  return raw ? raw.split(',').filter(Boolean) : [];
}

// Catalog filter/sort/page state lives entirely in the URL (category as the
// route's :categoryId segment, everything else as query params) instead of
// React state — that's what makes it reset on navigation for free instead of
// needing an explicit "clear on leaving this screen" effect, and makes a
// filtered/sorted view something a user can actually bookmark or share.
export function useCatalogParams() {
  const { categoryId } = useParams<{ categoryId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const category = categoryId ?? 'all';
  const search = searchParams.get('q') ?? '';
  const sizes = useMemo(() => parseList(searchParams.get('sizes')), [searchParams]);
  const brands = useMemo(() => parseList(searchParams.get('brands')) as SaleId[], [searchParams]);
  const sort = (searchParams.get('sort') as SortOption | null) ?? DEFAULT_SORT;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const filters: CatalogFilters = useMemo(() => ({ search, sizes, brands }), [search, sizes, brands]);

  // Filter/sort refinements (typing a search term, toggling a size chip) replace
  // the current history entry instead of pushing a new one — otherwise every
  // keystroke or checkbox click would be its own back-button stop.
  const patch = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (next: CatalogFilters) => {
      patch({
        q: next.search || null,
        sizes: next.sizes.length ? next.sizes.join(',') : null,
        brands: next.brands.length ? next.brands.join(',') : null,
      });
    },
    [patch],
  );

  const setSort = useCallback((next: SortOption) => patch({ sort: next === DEFAULT_SORT ? null : next }), [patch]);
  const setPage = useCallback((next: number) => patch({ page: next > 1 ? String(next) : null }), [patch]);
  const resetFilters = useCallback(() => patch({ q: null, sizes: null, brands: null, sort: null }), [patch]);

  // Any real filter/sort/category change should jump back to page 1 — but not
  // on mount (e.g. returning from a product via the back button should land on
  // whatever page was already in the URL, not get bounced back to page 1).
  // Compares against the last-seen key rather than a plain "did this effect
  // run before" boolean ref: StrictMode's dev-only double-invoke replays this
  // effect once right after mount with nothing actually changed, and a plain
  // boolean flips true on that replay too — firing a spurious setPage(1) that
  // races the very next real update (observed as a dropped first keystroke).
  const sizesKey = sizes.join(',');
  const brandsKey = brands.join(',');
  const resetKey = `${category}|${search}|${sizesKey}|${brandsKey}|${sort}`;
  const lastResetKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastResetKey.current !== null && lastResetKey.current !== resetKey) setPage(1);
    lastResetKey.current = resetKey;
  }, [resetKey, setPage]);

  return { category, filters, sort, page, setFilters, setSort, setPage, resetFilters };
}
