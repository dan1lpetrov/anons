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
import { products as seedProducts } from './data/products';
import { useCart } from './hooks/useCart';
import { TelegramContext, useTelegram } from './hooks/useTelegram';
import type { Banner, Order, Product } from './types';
import { getAvailableCategories } from './utils/catalog';
import { logProductEvent, logProductEvents } from './utils/events';
import { createOrderId, getOrderFromLocalStorage, saveOrderToLocalStorage } from './utils/orderExport';
import { getScrollContainer } from './utils/scroll';

interface ProductRouteProps {
  products: Product[];
  isLoadingProducts: boolean;
  onAddToCart: (product: Product, size: string, colorId: string, quantity: number) => void;
  onBack: () => void;
  onShare: (product: Product) => void;
}

function ProductRoute({ products, isLoadingProducts, onAddToCart, onBack, onShare }: ProductRouteProps) {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);
  if (!product) {
    // A shared link hard-loads this route before the /api/products fetch
    // resolves, so `products` is briefly empty — wait for it instead of
    // bouncing straight to home, or a direct product link would never work.
    if (isLoadingProducts) {
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
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [banners, setBanners] = useState<Banner[]>([]);
  const cart = useCart(products);

  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const productMatch = useMatch('/product/:id');
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productMatch?.params.id),
    [products, productMatch],
  );

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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) setBanners(data as Banner[]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const availableCategories = useMemo(() => getAvailableCategories(products), [products]);

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
                  products={products}
                  categories={availableCategories}
                  banners={banners}
                  isLoading={isLoadingProducts}
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
            <Route
              path="/catalog"
              element={<CatalogRoute products={products} isLoadingProducts={isLoadingProducts} onOpenProduct={openProduct} />}
            />
            <Route
              path="/catalog/:categoryId"
              element={<CatalogRoute products={products} isLoadingProducts={isLoadingProducts} onOpenProduct={openProduct} />}
            />
            <Route
              path="/product/:id"
              element={
                <ProductRoute
                  products={products}
                  isLoadingProducts={isLoadingProducts}
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
