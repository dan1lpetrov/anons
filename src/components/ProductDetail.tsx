import { useState } from 'react';
import type { Product } from '../types';
import { discountPercent, formatPrice } from '../utils/format';

interface ProductDetailProps {
  product: Product;
  onAddToCart: (size: string, colorId: string, quantity: number) => void;
}

export function ProductDetail({ product, onAddToCart }: ProductDetailProps) {
  const [size, setSize] = useState(product.sizes[0] ?? '');
  const [colorId, setColorId] = useState(product.colors[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);

  const discount = discountPercent(product.price, product.originalPrice);
  const selectedColor = product.colors.find((c) => c.id === colorId);

  const handleAdd = () => {
    if (!size || !colorId) return;
    onAddToCart(size, colorId, quantity);
  };

  return (
    <div className="product-detail">
      <div className="product-detail__hero">
        <img src={product.image} alt={product.name} />
        {discount && <span className="product-detail__badge">−{discount}%</span>}
      </div>

      <div className="product-detail__content">
        <p className="product-detail__source">{product.sourceName}</p>
        <h1 className="product-detail__title">{product.name}</h1>

        <div className="product-detail__prices">
          <span className="product-detail__price">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <span className="product-detail__original">{formatPrice(product.originalPrice)}</span>
          )}
        </div>

        <p className="product-detail__desc">{product.description}</p>

        <div className="option-group">
          <label>Колір{selectedColor ? `: ${selectedColor.name}` : ''}</label>
          <div className="color-options">
            {product.colors.map((color) => (
              <button
                key={color.id}
                type="button"
                className={`color-swatch ${colorId === color.id ? 'active' : ''}`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
                onClick={() => setColorId(color.id)}
                aria-label={color.name}
              />
            ))}
          </div>
        </div>

        <div className="option-group">
          <label>Розмір</label>
          <div className="size-options">
            {product.sizes.map((s) => (
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
