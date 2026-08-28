import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartView } from './components/CartView';
import { CategoryFilter } from './components/CategoryFilter';
import { CatalogControls } from './components/CatalogControls';
import { Header } from './components/Header';
import { OrderSuccess } from './components/OrderSuccess';
import { Pagination } from './components/Pagination';
import { ProductCard, type ProductDebugStats } from './components/ProductCard';
import { ProductDetail } from './components/ProductDetail';
import { products as seedProducts } from './data/products';
import { sales } from './data/sales';
import { useCart } from './hooks/useCart';
import { useTelegram } from './hooks/useTelegram';
import type { CatalogFilters, CategoryId, Order, Product, Screen, SortOption } from './types';
import { filterAndSortProducts, getAvailableCategories, getAvailableSizes } from './utils/catalog';
import { logProductEvent, logProductEvents } from './utils/events';
import {
  createOrderId,
  saveOrderToLocalStorage,
} from './utils/orderExport';

const SCREEN_TITLES: Record<Screen, string> = {
  home: 'Anons Shop',
  catalog: 'Anons Shop',
  product: 'Anons Shop',
  cart: 'Кошик',
  success: 'Готово',
};

const PAGE_SIZE = 24;

// #root (not window) is the actual scroll container: `overflow-x: hidden` on html/body/#root
// forces overflow-y's computed value to `auto` per spec, so #root scrolls internally at 100% height.
function getScrollContainer(): Element {
  return document.getElementById('root') ?? document.documentElement;
}

export default function App() {
  const { tg, user, haptic, showAlert } = useTelegram();
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const cart = useCart(products);

  const [screen, setScreen] = useState<Screen>('catalog');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [filters, setFilters] = useState<CatalogFilters>({ search: '', sizes: [], brands: [] });
  const [sort, setSort] = useState<SortOption>('recommended');
  const [page, setPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) setProducts(data as Product[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingProducts(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  const catalogContext = useMemo(
    () => category === 'all' ? { mode: 'all' as const } : { mode: 'category' as const, categoryId: category },
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

  useEffect(() => {
    setPage(1);
  }, [catalogContext, filters, sort]);

  const isFirstPageRender = useRef(true);
  useEffect(() => {
    if (isFirstPageRender.current) {
      isFirstPageRender.current = false;
      return;
    }
    getScrollContainer().scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const changePage = (nextPage: number) => setPage(nextPage);

  const selectableProducts = useMemo(
    () => category === 'all' ? products : products.filter((product) => product.categoryId === category),
    [products, category],
  );
  const availableCategories = useMemo(() => getAvailableCategories(products), [products]);
  const resetFilters = () => {
    setFilters({ search: '', sizes: [], brands: [] });
    setSort('recommended');
  };

  const scrollPositions = useRef<Partial<Record<Screen, number>>>({});

  const navigate = useCallback((next: Screen, productId?: string | null) => {
    scrollPositions.current[screen] = getScrollContainer().scrollTop;
    haptic('light');
    setScreen(next);
    if (productId !== undefined) setSelectedProductId(productId);
    window.history.pushState({ screen: next, productId: productId ?? selectedProductId }, '');
    requestAnimationFrame(() => getScrollContainer().scrollTo({ top: 0, behavior: 'auto' }));
  }, [haptic, selectedProductId, screen]);

  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    window.history.replaceState({ screen: 'catalog', productId: null }, '');

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { screen: Screen; productId: string | null } | null;
      const targetScreen = state?.screen ?? 'catalog';
      setScreen(targetScreen);
      setSelectedProductId(state?.productId ?? null);
      const savedY = scrollPositions.current[targetScreen] ?? 0;
      requestAnimationFrame(() => getScrollContainer().scrollTo({ top: savedY, behavior: 'auto' }));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!tg) return;

    const handleMainButton = () => {
      if (screen === 'product' && selectedProduct) {
        const size = selectedProduct.sizes[0];
        const colorId = selectedProduct.colors[0]?.id;
        if (size && colorId) {
          cart.addItem({ productId: selectedProduct.id, size, colorId, quantity: 1 });
          haptic('success');
          showAlert('Додано в кошик!');
        }
      }
    };

    if (screen === 'product' && selectedProduct) {
      tg.MainButton.setText('Додати в кошик');
      tg.MainButton.show();
      tg.MainButton.enable();
      tg.MainButton.onClick(handleMainButton);
    } else {
      tg.MainButton.hide();
    }

    return () => {
      tg.MainButton.offClick(handleMainButton);
    };
  }, [tg, screen, selectedProduct, cart, navigate, haptic, showAlert]);

  useEffect(() => {
    if (!tg) return;

    const showBack = screen !== 'catalog' && screen !== 'success';
    if (showBack) {
      tg.BackButton.show();
      tg.BackButton.onClick(goBack);
    } else {
      tg.BackButton.hide();
    }

    return () => {
      tg.BackButton.offClick(goBack);
    };
  }, [tg, screen, goBack]);

  const openProduct = (id: string) => {
    navigate('product', id);
    logProductEvent('view', id, user?.id);
  };

  const handleAddToCart = (size: string, colorId: string, quantity: number) => {
    if (!selectedProductId) return;
    cart.addItem({ productId: selectedProductId, size, colorId, quantity });
    haptic('success');
    showAlert('Додано в кошик!');
  };

  const handleSubmitOrder = (comment: string) => {
    const order: Order = {
      id: createOrderId(),
      createdAt: new Date().toISOString(),
      customer: { comment },
      items: cart.enrichedItems.map(({ product, color, item, lineTotal }) => ({
        product,
        size: item.size,
        color,
        quantity: item.quantity,
        lineTotal,
      })),
      total: cart.totalPrice,
      telegramUser: user,
    };

    saveOrderToLocalStorage(order);
    logProductEvents(
      [...new Set(order.items.map((i) => i.product.id))].map((productId) => ({ productId, eventType: 'order' as const })),
      user?.id,
    );

    cart.clearCart();
    setLastOrder(order);
    haptic('success');
    navigate('success');
  };

  return (
    <div className="app">
      <Header
        title={SCREEN_TITLES[screen]}
        cartCount={cart.totalItems}
        showCart={screen === 'catalog' || screen === 'product'}
        onCartClick={() => navigate('cart')}
        searchValue={filters.search}
        onSearchChange={(search) => setFilters({ ...filters, search })}
        onHomeClick={() => navigate('catalog')}
      />

      <main className="app-main">
        {screen === 'catalog' && (
          <>
            <p className="catalog-intro">
              Розпродажі одягу з популярних магазинів. Оберіть товар — ми сформуємо замовлення для ручного викупу.
            </p>
            <CategoryFilter active={category} categories={availableCategories} onChange={setCategory} />
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
                          onClick={() => openProduct(product.id)}
                          debug={debugStats[product.id]}
                        />
                      ))}
                    </div>
                    <Pagination page={currentPage} totalPages={totalPages} onChange={changePage} />
                  </>
                ) : (
                  <div className="empty-state"><span className="empty-state__icon">🔎</span><h2>Нічого не знайдено</h2><p>Спробуйте змінити параметри пошуку або фільтри.</p></div>
                )}
              </CatalogControls>
            </div>
          </>
        )}

        {screen === 'product' && selectedProduct && (
          <ProductDetail product={selectedProduct} onAddToCart={handleAddToCart} onBack={goBack} />
        )}

        {screen === 'cart' && (
          <CartView
            items={cart.enrichedItems}
            totalPrice={cart.totalPrice}
            onUpdateQuantity={cart.updateQuantity}
            onRemove={cart.removeItem}
            onCheckout={handleSubmitOrder}
          />
        )}

        {screen === 'success' && lastOrder && (
          <OrderSuccess
            order={lastOrder}
            onContinue={() => navigate('catalog')}
          />
        )}
      </main>
    </div>
  );
}
