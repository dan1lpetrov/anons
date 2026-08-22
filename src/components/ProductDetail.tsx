import { useEffect, useRef, useState } from 'react';
import type { Product } from '../types';
import { discountPercent, formatPrice } from '../utils/format';

interface ProductDetailProps {
  product: Product;
  onAddToCart: (size: string, colorId: string, quantity: number) => void;
  onBack: () => void;
}

export function ProductDetail({ product, onAddToCart, onBack }: ProductDetailProps) {
  const [colorId, setColorId] = useState(product.colors[0]?.id ?? '');
  const selectedColor = product.colors.find((c) => c.id === colorId) ?? product.colors[0];

  const [size, setSize] = useState(selectedColor?.sizes[0] ?? '');
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setSize(selectedColor?.sizes[0] ?? '');
    setActiveImage(0);
  }, [colorId, selectedColor]);

  const discount = discountPercent(product.price, product.originalPrice);
  const images = selectedColor?.images.length ? selectedColor.images : [product.image];

  const handleAdd = () => {
    if (!size || !colorId) return;
    onAddToCart(size, colorId, quantity);
  };

  return (
    <div
      className="product-detail"
      onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        if (start && start.x <= 32 && touch.clientX - start.x > 80 && Math.abs(touch.clientY - start.y) < 70) onBack();
        touchStart.current = null;
      }}
    >
      <div className="product-detail__gallery">
        <div className="product-detail__hero">
          <img src={images[activeImage] ?? images[0]} alt={product.name} />
          {discount && <span className="product-detail__badge">−{discount}%</span>}
        </div>

        {images.length > 1 && (
          <div className="product-detail__thumbs">
            {images.map((img, index) => (
              <button
                key={img}
                type="button"
                className={`product-detail__thumb ${activeImage === index ? 'active' : ''}`}
                onClick={() => setActiveImage(index)}
                aria-label={`Фото ${index + 1}`}
              >
                <img src={img} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="product-detail__content">
        <p className="product-detail__source">{product.sourceName}</p>
        <h1 className="product-detail__title">
          <a href={product.productUrl} target="_blank" rel="noopener noreferrer">
            {product.name}
          </a>
        </h1>

        <div className="product-detail__prices">
          <span className="product-detail__price">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <span className="product-detail__original">{formatPrice(product.originalPrice)}</span>
          )}
        </div>

        <p className="product-detail__desc">{product.description}</p>

        {product.colors.length > 1 && (
          <div className="option-group">
            <label>Варіант{selectedColor ? `: ${selectedColor.name}` : ''}</label>
            <div className="color-options">
              {product.colors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  className={`color-swatch ${colorId === color.id ? 'active' : ''}`}
                  title={color.name}
                  onClick={() => setColorId(color.id)}
                  aria-label={color.name}
                >
                  <img src={color.thumbnail} alt="" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="option-group">
          <label>Розмір</label>
          <div className="size-options">
            {(selectedColor?.sizes ?? []).map((s) => (
              <button
                key={s}
                type="button"
                className={`size-chip ${size === s ? 'active' : ''}`}
                onClick={() => setSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="option-group">
          <label>Кількість</label>
          <div className="quantity-control">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Зменшити"
            >
              −
            </button>
            <span>{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Збільшити"
            >
              +
            </button>
          </div>
        </div>

        <div className="source-link-box">
          <p>Товар з розпродажу:</p>
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
            {product.sourceName} →
          </a>
        </div>

        <button type="button" className="btn-primary btn-full" onClick={handleAdd}>
          Додати в кошик — {formatPrice(product.price * quantity)}
        </button>
      </div>
    </div>
  );
}
