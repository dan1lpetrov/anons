import { ChevronRight } from 'lucide-react';
import type { Banner, Category, Product } from '../types';
import { BannerCarousel } from './BannerCarousel';
import { ProductCard } from './ProductCard';

interface HomeProps {
  products: Product[];
  categories: Category[];
  banners: Banner[];
  isLoading: boolean;
  onOpenProduct: (id: string) => void;
  onViewCategory: (categoryId: string) => void;
  onViewSale: (saleId: string) => void;
  onOpenLink: (url: string) => void;
  onViewAll: () => void;
}

const TOP_PRODUCTS_COUNT = 10;

export function Home({ products, categories, banners, isLoading, onOpenProduct, onViewCategory, onViewSale, onOpenLink, onViewAll }: HomeProps) {
  const topProducts = products.slice(0, TOP_PRODUCTS_COUNT);

  return (
    <div className="home">
      <p className="catalog-intro">
        Розпродажі одягу з популярних магазинів. Оберіть товар — ми сформуємо замовлення для ручного викупу.
      </p>

      <BannerCarousel
        banners={banners}
        onSelect={(banner) => {
          if (banner.linkUrl) onOpenLink(banner.linkUrl);
          else if (banner.linkSaleId) onViewSale(banner.linkSaleId);
          else if (banner.linkCategoryId) onViewCategory(banner.linkCategoryId);
          else onViewAll();
        }}
      />

      <section className="home-section">
        <div className="home-section__header">
          <h2>Топові товари</h2>
          <button type="button" className="home-section__view-all" onClick={onViewAll}>
            Дивитись всі <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        {isLoading ? (
          <div className="home-product-row">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="product-card product-card--skeleton">
                <div className="product-card__image-wrap skeleton-block" />
                <div className="product-card__body">
                  <div className="skeleton-block skeleton-line skeleton-line--short" />
                  <div className="skeleton-block skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          topProducts.length > 0 && (
            <div className="home-product-row">
              {topProducts.map((product) => (
                <ProductCard key={product.id} product={product} onClick={() => onOpenProduct(product.id)} />
              ))}
            </div>
          )
        )}
      </section>

      {categories.length > 0 && (
        <section className="home-section">
          <div className="home-section__header">
            <h2>Категорії</h2>
          </div>
          <div className="home-category-grid">
            {categories.map((cat) => {
              const image = products.find((p) => p.categoryId === cat.id)?.image;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="home-category-tile"
                  style={image ? { backgroundImage: `url(${image})` } : undefined}
                  onClick={() => onViewCategory(cat.id)}
                >
                  <span className="home-category-tile__label">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
