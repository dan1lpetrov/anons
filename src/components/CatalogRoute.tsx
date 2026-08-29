import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CategoryId, Product } from '../types';
import { sales } from '../data/sales';
import { useCatalogParams } from '../hooks/useCatalogParams';
import { useTelegramContext } from '../hooks/useTelegram';
import { filterAndSortProducts, getAvailableCategories, getAvailableSizes } from '../utils/catalog';
import { getScrollContainer } from '../utils/scroll';
import { CatalogControls } from './CatalogControls';
import { CategoryFilter } from './CategoryFilter';
import { Pagination } from './Pagination';
import { ProductCard, type ProductDebugStats } from './ProductCard';

const PAGE_SIZE = 24;

interface CatalogRouteProps {
  products: Product[];
  isLoadingProducts: boolean;
  onOpenProduct: (id: string) => void;
}

export function CatalogRoute({ products, isLoadingProducts, onOpenProduct }: CatalogRouteProps) {
  const navigate = useNavigate();
  const { haptic } = useTelegramContext();
  const { category, filters, sort, page, setFilters, setSort, setPage, resetFilters } = useCatalogParams();

  const catalogContext = useMemo(
    () => (category === 'all' ? { mode: 'all' as const } : { mode: 'category' as const, categoryId: category }),
    [category],
  );
  const filteredProducts = useMemo(
    () => filterAndSortProducts(products, catalogContext, filters, sort),
    [products, catalogContext, filters, sort],
  );
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredProducts, currentPage],
  );

  // Admin-only ranking diagnostics for the catalog grid (see CLAUDE.md "Product ranking score").
  // /api/debug/product-score 401s for non-admins, so debugStats just stays empty for regular visitors.
  const [debugStats, setDebugStats] = useState<Record<string, ProductDebugStats>>({});
  useEffect(() => {
    if (pagedProducts.length === 0) return;
    let cancelled = false;
    const ids = pagedProducts.map((p) => p.id).join(',');
    fetch(`/api/debug/product-score?productIds=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, ProductDebugStats> | null) => {
        if (!cancelled && data) setDebugStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pagedProducts]);

  const isFirstPageRender = useRef(true);
  useEffect(() => {
    if (isFirstPageRender.current) {
      isFirstPageRender.current = false;
      return;
    }
    getScrollContainer().scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const selectableProducts = useMemo(
    () => (category === 'all' ? products : products.filter((product) => product.categoryId === category)),
    [products, category],
  );
  const availableCategories = useMemo(() => getAvailableCategories(products), [products]);

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
          sizes={getAvailableSizes(selectableProducts)}
          brands={sales}
          resultCount={filteredProducts.length}
          onFiltersChange={setFilters}
          onSortChange={setSort}
          onReset={resetFilters}
        >
          {isLoadingProducts ? (
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
          ) : filteredProducts.length ? (
            <>
              <div className="product-grid">
                {pagedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => onOpenProduct(product.id)}
                    debug={debugStats[product.id]}
                  />
                ))}
              </div>
              <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
            </>
          ) : (
            <div className="empty-state"><SearchX className="empty-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" /><h2>Нічого не знайдено</h2><p>Спробуйте змінити параметри пошуку або фільтри.</p></div>
          )}
        </CatalogControls>
      </div>
    </>
  );
}
