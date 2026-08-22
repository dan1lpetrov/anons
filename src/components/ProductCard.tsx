import type { Product } from '../types';
import { colorOriginalPrice, colorPrice, discountPercent, formatPrice, pluralizeUk } from '../utils/format';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const colorPrices = product.colors.length
    ? product.colors.map((c) => colorPrice(product, c))
    : [product.price];
  const minPrice = Math.min(...colorPrices);
  const hasPriceRange = new Set(colorPrices).size > 1;
  const cheapestColor = product.colors.find((c) => colorPrice(product, c) === minPrice);
  const originalPrice = colorOriginalPrice(product, cheapestColor);
  const discount = discountPercent(minPrice, originalPrice);

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
          <span className="product-card__price">
            {hasPriceRange && 'від '}
            {formatPrice(minPrice)}
          </span>
          {originalPrice && (
            <span className="product-card__original">{formatPrice(originalPrice)}</span>
          )}
        </div>
        <div className="product-card__meta">
          {product.sizes.length > 1 && (
            <span>{product.sizes.length} {pluralizeUk(product.sizes.length, ['розмір', 'розміри', 'розмірів'])}</span>
          )}
          {product.colors.length > 1 && (
            <span>{product.colors.length} {pluralizeUk(product.colors.length, ['колір', 'кольори', 'кольорів'])}</span>
          )}
        </div>
      </div>
    </button>
  );
}
