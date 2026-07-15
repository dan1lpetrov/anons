import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartView } from './components/CartView';
import { CategoryFilter } from './components/CategoryFilter';
import { CatalogControls } from './components/CatalogControls';
import { Header } from './components/Header';
import { OrderSuccess } from './components/OrderSuccess';
import { ProductCard } from './components/ProductCard';
import { ProductDetail } from './components/ProductDetail';
import { products } from './data/products';
import { sales } from './data/sales';
import { useCart } from './hooks/useCart';
import { useTelegram } from './hooks/useTelegram';
import type { CatalogFilters, CategoryId, Order, Screen, SortOption } from './types';
import { filterAndSortProducts, getAvailableColors, getAvailableSizes } from './utils/catalog';
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

export default function App() {
  const { tg, user, haptic, showAlert } = useTelegram();
  const cart = useCart();

  const [screen, setScreen] = useState<Screen>('catalog');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [filters, setFilters] = useState<CatalogFilters>({ search: '', sizes: [], colors: [], brands: [] });
  const [sort, setSort] = useState<SortOption>('recommended');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [selectedProductId],
  );

  const catalogContext = useMemo(
    () => category === 'all' ? { mode: 'all' as const } : { mode: 'category' as const, categoryId: category },
    [category],
  );
  const filteredProducts = useMemo(
    () => filterAndSortProducts(products, catalogContext, filters, sort),
    [catalogContext, filters, sort],
  );
  const selectableProducts = useMemo(
    () => category === 'all' ? products : products.filter((product) => product.categoryId === category),
    [category],
  );
  const resetFilters = () => {
    setFilters({ search: '', sizes: [], colors: [], brands: [] });
    setSort('recommended');
  };

  const navigate = useCallback((next: Screen) => {
    haptic('light');
    setScreen(next);
  }, [haptic]);

  const goBack = useCallback(() => {
    if (screen === 'product') navigate('catalog');
    else if (screen === 'cart') navigate('catalog');
    else if (screen === 'success') navigate('catalog');
  }, [screen, navigate]);

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
    setSelectedProductId(id);
    navigate('product');
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
            <CategoryFilter active={category} onChange={setCategory} />
            <CatalogControls
              filters={filters}
              sort={sort}
              sizes={getAvailableSizes(selectableProducts)}
              colors={getAvailableColors(selectableProducts)}
              brands={sales}
              resultCount={filteredProducts.length}
              onFiltersChange={setFilters}
              onSortChange={setSort}
              onReset={resetFilters}
            />
            {filteredProducts.length ? (
              <div className="product-grid">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onClick={() => openProduct(product.id)} />
                ))}
              </div>
            ) : (
              <div className="empty-state"><span className="empty-state__icon">🔎</span><h2>Нічого не знайдено</h2><p>Спробуйте змінити параметри пошуку або фільтри.</p></div>
            )}
          </>
        )}

        {screen === 'product' && selectedProduct && (
          <ProductDetail product={selectedProduct} onAddToCart={handleAddToCart} onBack={() => navigate('catalog')} />
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
