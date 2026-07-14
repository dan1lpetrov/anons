import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProductById } from '../data/products';
import type { CartItem, Product, ProductColor } from '../types';

const CART_KEY = 'anons-cart';

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function cartItemKey(item: Pick<CartItem, 'productId' | 'size' | 'colorId'>) {
  return `${item.productId}:${item.size}:${item.colorId}`;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    const qty = item.quantity ?? 1;
    setItems((prev) => {
      const key = cartItemKey(item);
      const existing = prev.find((i) => cartItemKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          cartItemKey(i) === key ? { ...i, quantity: i.quantity + qty } : i,
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => cartItemKey(i) !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => cartItemKey(i) !== key));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (cartItemKey(i) === key ? { ...i, quantity } : i)),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const totalPrice = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = getProductById(item.productId);
        return sum + (product?.price ?? 0) * item.quantity;
      }, 0),
    [items],
  );

  const enrichedItems = useMemo(
    () =>
      items
        .map((item) => {
          const product = getProductById(item.productId);
          if (!product) return null;
          const color = product.colors.find((c) => c.id === item.colorId);
          if (!color) return null;
          return {
            key: cartItemKey(item),
            item,
            product,
            color,
            lineTotal: product.price * item.quantity,
          };
        })
        .filter(Boolean) as Array<{
        key: string;
        item: CartItem;
        product: Product;
        color: ProductColor;
        lineTotal: number;
      }>,
    [items],
  );

  return {
    items,
    enrichedItems,
    totalItems,
    totalPrice,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };
}
