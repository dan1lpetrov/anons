import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CategoryId, Product, ProductsListResponse, ProductsMeta } from '../types';
import { sales } from '../data/sales';
import { useCatalogParams } from '../hooks/useCatalogParams';
import { useTelegramContext } from '../hooks/useTelegram';
import { categoriesFromMeta, getAvailableSizes } from '../utils/catalog';
import { getScrollContainer } from '../utils/scroll';
import { CatalogControls } from './CatalogControls';
import { CategoryFilter } from './CategoryFilter';
import { Pagination } from './Pagination';
import { ProductCard, type ProductDebugStats } from './ProductCard';

const PAGE_SIZE = 24;

interface CatalogRouteProps {
  meta: ProductsMeta | null;
  onOpenProduct: (id: string) => void;
}

export function CatalogRoute({ meta, onOpenProduct }: CatalogRouteProps) {
  const navigate = useNavigate();
  const { haptic } = useTelegramContext();
  const { category, filters, sort, page, setFilters, setSort, setPage, resetFilters } = useCatalogParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (category !== 'all') params.set('category', category);
    if (filters.search) params.set('q', filters.search);
    if (filters.sizes.length) params.set('sizes', filters.sizes.join(','));
    if (filters.brands.length) params.set('brands', filters.brands.join(','));

    fetch(`/api/products?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProductsListResponse | null) => {
        if (cancelled) return;
        setProducts(data?.products ?? []);
        setTotalCount(data?.totalCount ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setTotalCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, filters.search, filters.sizes, filters.brands, sort, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const availableSizes = useMemo(
    () => (meta ? getAvailableSizes(meta.sizesByCategory, category) : { clothing: { regular: [], tall: [] }, shoes: [], accessories: [] }),
    [meta, category],
  );
  const availableCategories = useMemo(() => (meta ? categoriesFromMeta(meta) : []), [meta]);

  // Admin-only ranking diagnostics for the catalog grid (see CLAUDE.md "Product ranking score").
  // /api/debug/product-score 401s for non-admins, so debugStats just stays empty for regular visitors.
  const [debugStats, setDebugStats] = useState<Record<string, ProductDebugStats>>({});
  useEffect(() => {
    if (products.length === 0) return;
    let cancelled = false;
    const ids = products.map((p) => p.id).join(',');
    fetch(`/api/debug/product-score?productIds=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, ProductDebugStats> | null) => {
        if (!cancelled && data) setDebugStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [products]);

  const isFirstPageRender = useRef(true);
  useEffect(() => {
    if (isFirstPageRender.current) {
      isFirstPageRender.current = false;
      return;
    }
    getScrollContainer().scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const changeCategory = (next: CategoryId | 'all') => {
    haptic('light');
    navigate(next === 'all' ? '/catalog' : `/catalog/${encodeURIComponent(next)}`);
  };

  return (
    <>
      <CategoryFilter active={category} categories={availableCategories} onChange={changeCategory} />
      <div className="catalog-layout">
        <CatalogControls
          filters={filters}
          sort={sort}
          sizes={availableSizes}
          brands={sales}
          resultCount={totalCount}
          onFiltersChange={setFilters}
          onSortChange={setSort}
          onReset={resetFilters}
        >
          {isLoading ? (
            <div className="product-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="product-card product-card--skeleton">
                  <div className="product-card__image-wrap skeleton-block" />
                  <div className="product-card__body">
                    <div className="skeleton-block skeleton-line skeleton-line--short" />
                    <div className="skeleton-block skeleton-line" />
                    <div className="skeleton-block skeleton-line skeleton-line--short" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length ? (
            <>
              <div className="product-grid">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => onOpenProduct(product.id)}
                    debug={debugStats[product.id]}
                  />
                ))}
              </div>
              <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={setPage} />
            </>
          ) : (
            <div className="empty-state"><SearchX className="empty-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" /><h2>Нічого не знайдено</h2><p>Спробуйте змінити параметри пошуку або фільтри.</p></div>
          )}
        </CatalogControls>
      </div>
    </>
  );
}
