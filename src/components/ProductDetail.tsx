import { useEffect, useRef, useState } from 'react';
import type { Product } from '../types';
import { colorOriginalPrice, colorPrice, discountPercent, formatPrice } from '../utils/format';
import { sortSizes } from '../utils/sizes';

interface ProductDetailProps {
  product: Product;
  onAddToCart: (size: string, colorId: string, quantity: number) => void;
  onBack: () => void;
}

export function ProductDetail({ product, onAddToCart, onBack }: ProductDetailProps) {
  const [colorId, setColorId] = useState(product.colors[0]?.id ?? '');
  const selectedColor = product.colors.find((c) => c.id === colorId) ?? product.colors[0];
  const sortedSizes = sortSizes(selectedColor?.sizes ?? []);

  const [size, setSize] = useState(sortedSizes[0] ?? '');
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const galleryTouchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setSize(sortedSizes[0] ?? '');
    setActiveImage(0);
    setDragPx(0);
    setDragging(false);
  }, [colorId, selectedColor, sortedSizes]);

  const price = colorPrice(product, selectedColor);
  const originalPrice = colorOriginalPrice(product, selectedColor);
  const discount = discountPercent(price, originalPrice);
  const images = selectedColor?.images.length ? selectedColor.images : [product.image];

  const goToImage = (delta: number) => {
    setActiveImage((prev) => {
      const next = (prev + delta + images.length) % images.length;
      return next;
    });
  };

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
        <div
          className="product-detail__hero"
          onTouchStart={(event) => {
            event.stopPropagation();
            const touch = event.touches[0];
            galleryTouchStart.current = { x: touch.clientX, y: touch.clientY };
            setDragging(true);
          }}
          onTouchMove={(event) => {
            const start = galleryTouchStart.current;
            if (!start || images.length < 2) return;
            const touch = event.touches[0];
            setDragPx(touch.clientX - start.x);
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
            const start = galleryTouchStart.current;
            galleryTouchStart.current = null;
            setDragging(false);
            if (!start || images.length < 2) {
              setDragPx(0);
              return;
            }
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            const width = event.currentTarget.offsetWidth || 1;
            if (Math.abs(dx) > width * 0.15 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              goToImage(dx < 0 ? 1 : -1);
            }
            setDragPx(0);
          }}
        >
          <div
            className="product-detail__track"
            style={{
              transform: `translate3d(calc(${-activeImage * 100}% + ${dragPx}px), 0, 0)`,
              transition: dragging ? 'none' : 'transform 0.28s ease',
            }}
          >
            {images.map((img, index) => (
              <img
                key={img}
                src={img}
                alt={index === 0 ? product.name : ''}
                className="product-detail__slide"
              />
            ))}
          </div>
          {discount && <span className="product-detail__badge">−{discount}%</span>}

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="product-detail__nav product-detail__nav--prev"
                onClick={() => goToImage(-1)}
                aria-label="Попереднє фото"
              >
                ‹
              </button>
              <button
                type="button"
                className="product-detail__nav product-detail__nav--next"
                onClick={() => goToImage(1)}
                aria-label="Наступне фото"
              >
                ›
              </button>
              <div className="product-detail__dots">
                {images.map((img, index) => (
                  <span key={img} className={`product-detail__dot ${activeImage === index ? 'active' : ''}`} />
                ))}
              </div>
            </>
          )}
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
          <span className="product-detail__price">{formatPrice(price)}</span>
          {originalPrice && (
            <span className="product-detail__original">{formatPrice(originalPrice)}</span>
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
            {sortedSizes.map((s) => (
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
          Додати в кошик — {formatPrice(price * quantity)}
        </button>
      </div>
    </div>
  );
}
