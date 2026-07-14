import type { Product } from '../types';
import { discountPercent, formatPrice } from '../utils/format';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const discount = discountPercent(product.price, product.originalPrice);

  return (
    <button type="button" className="product-card" onClick={onClick}>
      <div className="product-card__image-wrap">
        <img src={product.image} alt={product.name} loading="lazy" />
        {discount && <span className="product-card__badge">−{discount}%</span>}
      </div>
      <div className="product-card__body">
        <p className="product-card__source">{product.sourceName}</p>
        <h3 className="product-card__name">{product.name}</h3>
        <div className="product-card__prices">
          <span className="product-card__price">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <span className="product-card__original">{formatPrice(product.originalPrice)}</span>
          )}
        </div>
        <div className="product-card__meta">
          {product.sizes.length > 1 && (
            <span>{product.sizes.length} розмірів</span>
          )}
          <span>{product.colors.length} {product.colors.length === 1 ? 'колір' : 'кольори'}</span>
        </div>
      </div>
    </button>
  );
}
