import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
  useNavigationType,
  useParams,
} from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { CartView } from './components/CartView';
import { CatalogRoute } from './components/CatalogRoute';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { OrderSuccess } from './components/OrderSuccess';
import { ProductDetail } from './components/ProductDetail';
import { useCart } from './hooks/useCart';
import { TelegramContext, useTelegram } from './hooks/useTelegram';
import type { Banner, Order, Product, ProductsListResponse, ProductsMeta } from './types';
import { categoriesFromMeta } from './utils/catalog';
import { logProductEvent, logProductEvents } from './utils/events';
import { createOrderId, getOrderFromLocalStorage, saveOrderToLocalStorage } from './utils/orderExport';
import { getScrollContainer } from './utils/scroll';

interface ProductRouteProps {
  product: Product | null;
  isLoading: boolean;
  onAddToCart: (product: Product, size: string, colorId: string, quantity: number) => void;
  onBack: () => void;
  onShare: (product: Product) => void;
}

function ProductRoute({ product, isLoading, onAddToCart, onBack, onShare }: ProductRouteProps) {
  if (!product) {
    // A shared link hard-loads this route before its own /api/products?id= fetch resolves, so
    // wait for it instead of bouncing straight to home, or a direct product link would never work.
    if (isLoading) {
      return (
        <div className="product-detail-skeleton">
          <div className="skeleton-block product-detail-skeleton__image" />
          <div className="skeleton-block skeleton-line skeleton-line--short" />
          <div className="skeleton-block skeleton-line" />
          <div className="skeleton-block skeleton-line skeleton-line--short" />
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }
  return (
    <ProductDetail
      product={product}
      onAddToCart={(size, colorId, quantity) => onAddToCart(product, size, colorId, quantity)}
      onBack={onBack}
      onShare={() => onShare(product)}
    />
  );
}

function OrderRoute({ onContinue }: { onContinue: () => void }) {
  const { orderId } = useParams<{ orderId: string }>();
  const order = orderId ? getOrderFromLocalStorage(orderId) : undefined;
  if (!order) return <Navigate to="/" replace />;
  return <OrderSuccess order={order} onContinue={onContinue} />;
}

export default function App() {
  const telegram = useTelegram();
  const { tg, user, haptic, showAlert, openLink } = telegram;

  const location = useLocation();
  const cart = useCart(location.pathname === '/cart');
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const productMatch = useMatch('/product/:id');
  const productId = productMatch?.params.id;

  // Fetched by App (rather than each route) because both Home and CatalogRoute need it, and
  // fetching it once here — instead of duplicating it in both components — means switching
  // between them doesn't refetch. Gated on route so /product/:id, /cart, /order/:id never pay
  // for it at all. See useCatalogParams() note in CatalogRoute for why filters live in the URL.
  const [banners, setBanners] = useState<Banner[]>([]);
  const bannersFetchedRef = useRef(false);
  useEffect(() => {
    if (location.pathname !== '/' || bannersFetchedRef.current) return;
    bannersFetchedRef.current = true;
    let cancelled = false;
    fetch('/api/banners')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) setBanners(data as Banner[]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname]);

  const [meta, setMeta] = useState<ProductsMeta | null>(null);
  const metaFetchedRef = useRef(false);
  useEffect(() => {
    const needsMeta = location.pathname === '/' || location.pathname.startsWith('/catalog');
    if (!needsMeta || metaFetchedRef.current) return;
    metaFetchedRef.current = true;
    let cancelled = false;
    fetch('/api/products?meta=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProductsMeta | null) => {
        if (!cancelled && data) setMeta(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname]);
  const availableCategories = useMemo(() => (meta ? categoriesFromMeta(meta) : []), [meta]);

  const [homeProducts, setHomeProducts] = useState<Product[]>([]);
  const [isLoadingHomeProducts, setIsLoadingHomeProducts] = useState(true);
  const homeProductsFetchedRef = useRef(false);
  useEffect(() => {
    if (location.pathname !== '/' || homeProductsFetchedRef.current) return;
    homeProductsFetchedRef.current = true;
    let cancelled = false;
    fetch('/api/products?pageSize=10')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProductsListResponse | null) => {
        if (!cancelled) setHomeProducts(data?.products ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingHomeProducts(false);
      });
    return () => { cancelled = true; };
  }, [location.pathname]);

  // Keyed by id rather than a plain boolean loading flag, so a product-to-product navigation
  // (e.g. via "similar products") correctly shows a skeleton again instead of briefly rendering
  // the previous product under the new id.
  const [productFetch, setProductFetch] = useState<{ id: string; product: Product | null } | null>(null);
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetch(`/api/products?id=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!cancelled) setProductFetch({ id: productId, product: (data as Product | null) ?? null });
      })
      .catch(() => {
        if (!cancelled) setProductFetch({ id: productId, product: null });
      });
    return () => { cancelled = true; };
  }, [productId]);
  const selectedProduct = productId && productFetch?.id === productId ? productFetch.product : null;
  const isLoadingSelectedProduct = Boolean(productId) && productFetch?.id !== productId;

  // Scroll restoration for #root (the real scroll container — see utils/scroll.ts).
  // Continuously records the offset for whichever path is current, so whenever a
  // navigation away happens (from any component — Link, NavLink, a swipe gesture,
  // the browser's own back/forward), the last-recorded value for the page being
  // left is already up to date. Query-only changes (typing search, toggling a
  // filter) keep the same pathname and are intentionally ignored here — only a
  // real page change should move the scroll position.
  const scrollPositions = useRef<Record<string, number>>({});
  useEffect(() => {
    const container = getScrollContainer();
    const handleScroll = () => {
      scrollPositions.current[location.pathname] = container.scrollTop;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  const prevPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevPathnameRef.current === location.pathname) return;
    prevPathnameRef.current = location.pathname;
    const target = navigationType === 'POP' ? (scrollPositions.current[location.pathname] ?? 0) : 0;
    requestAnimationFrame(() => getScrollContainer().scrollTo({ top: target, behavior: 'auto' }));
  }, [location.pathname, navigationType]);

  const goBack = useCallback(() => navigate(-1), [navigate]);

  const goTo = useCallback((path: string) => {
    haptic('light');
    navigate(path);
  }, [haptic, navigate]);

  useEffect(() => {
    if (!tg) return;

    const handleMainButton = () => {
      if (selectedProduct) {
        const size = selectedProduct.sizes[0];
        const colorId = selectedProduct.colors[0]?.id;
        if (size && colorId) {
          cart.addItem({ productId: selectedProduct.id, size, colorId, quantity: 1 });
          haptic('success');
          showAlert('Додано в кошик!');
        }
      }
    };

    if (selectedProduct) {
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
  }, [tg, selectedProduct, cart, haptic, showAlert]);

  useEffect(() => {
    if (!tg) return;

    const showBack = location.pathname !== '/' && !location.pathname.startsWith('/order/');
    if (showBack) {
      tg.BackButton.show();
      tg.BackButton.onClick(goBack);
    } else {
      tg.BackButton.hide();
    }

    return () => {
      tg.BackButton.offClick(goBack);
    };
  }, [tg, location.pathname, goBack]);

  const openProduct = (id: string) => {
    goTo(`/product/${encodeURIComponent(id)}`);
    logProductEvent('view', id, user?.id);
  };

  const handleAddToCart = (product: Product, size: string, colorId: string, quantity: number) => {
    cart.addItem({ productId: product.id, size, colorId, quantity });
    haptic('success');
    showAlert('Додано в кошик!');
  };

  const handleShareProduct = async (product: Product) => {
    const url = `${window.location.origin}/product/${product.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, url });
      } catch {
        // user dismissed the share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      haptic('success');
      showAlert('Посилання скопійовано!');
    } catch {
      showAlert(url);
    }
  };

  const handleSubmitOrder = (comment: string) => {
    const orderId = createOrderId();
    const order: Order = {
      id: orderId,
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
    // One event per cart line (not deduped by product) so the admin dashboard can derive both a
    // distinct-order count (COUNT DISTINCT orderId) and an order value (SUM quantity*unitPrice).
    logProductEvents(
      order.items.map((i) => ({
        productId: i.product.id,
        eventType: 'order' as const,
        orderId,
        quantity: i.quantity,
        unitPrice: i.lineTotal / i.quantity,
      })),
      user?.id,
    );

    cart.clearCart();
    haptic('success');
    navigate(`/order/${order.id}`);
  };

  const showBottomNav = !location.pathname.startsWith('/order/');

  return (
    <TelegramContext.Provider value={telegram}>
      <div className={`app ${showBottomNav ? 'app--with-nav' : ''}`}>
        <Header cartCount={cart.totalItems} />

        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={
                <Home
                  topProducts={homeProducts}
                  categories={availableCategories}
                  banners={banners}
                  isLoading={isLoadingHomeProducts}
                  onOpenProduct={openProduct}
                  onViewCategory={(categoryId) => goTo(`/catalog/${encodeURIComponent(categoryId)}`)}
                  onViewSale={(saleId) => goTo(`/catalog?brands=${encodeURIComponent(saleId)}`)}
                  onOpenLink={(url) => {
                    haptic('light');
                    openLink(url);
                  }}
                  onViewAll={() => goTo('/catalog')}
                />
              }
            />
            <Route path="/catalog" element={<CatalogRoute meta={meta} onOpenProduct={openProduct} />} />
            <Route path="/catalog/:categoryId" element={<CatalogRoute meta={meta} onOpenProduct={openProduct} />} />
            <Route
              path="/product/:id"
              element={
                <ProductRoute
                  product={selectedProduct}
                  isLoading={isLoadingSelectedProduct}
                  onAddToCart={handleAddToCart}
                  onBack={goBack}
                  onShare={handleShareProduct}
                />
              }
            />
            <Route
              path="/cart"
              element={
                <CartView
                  items={cart.enrichedItems}
                  totalPrice={cart.totalPrice}
                  onUpdateQuantity={cart.updateQuantity}
                  onRemove={cart.removeItem}
                  onCheckout={handleSubmitOrder}
                />
              }
            />
            <Route path="/order/:orderId" element={<OrderRoute onContinue={() => navigate('/')} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {showBottomNav && <BottomNav cartCount={cart.totalItems} />}
      </div>
    </TelegramContext.Provider>
  );
}
