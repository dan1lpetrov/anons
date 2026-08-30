import type { ProductCardData } from '../types';
import { colorOriginalPrice, colorPrice, discountPercent, formatPrice, pluralizeUk } from '../utils/format';

export interface ProductDebugStats {
  score: number | null;
  computedAt: string | null;
  viewCount: number;
  orderCount: number;
  trendingCount: number;
}

interface ProductCardProps {
  product: ProductCardData;
  onClick: () => void;
  debug?: ProductDebugStats;
}

export function ProductCard({ product, onClick, debug }: ProductCardProps) {
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
            {hasPriceRange && <span className="product-card__price-prefix">від </span>}
            {formatPrice(minPrice, product.currency)}
          </span>
          {originalPrice && (
            <span className="product-card__original">{formatPrice(originalPrice, product.currency)}</span>
          )}
        </div>
        <div className="product-card__meta">
          {product.colors.length > 1 && (
            <span>{product.colors.length} {pluralizeUk(product.colors.length, ['колір', 'кольори', 'кольорів'])}</span>
          )}
        </div>
        {debug && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2px 8px',
              marginTop: 6,
              fontFamily: 'monospace',
              fontSize: 10,
              color: '#888',
            }}
          >
            <span>score {debug.score !== null ? debug.score.toFixed(3) : '—'}</span>
            <span>views {debug.viewCount}</span>
            <span>orders {debug.orderCount}</span>
            <span>trend48h {debug.trendingCount}</span>
          </div>
        )}
      </div>
    </button>
  );
}
