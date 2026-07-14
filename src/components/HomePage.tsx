import { categories } from '../data/categories';
import { countProductsByCategory, countProductsBySale } from '../data/products';
import { sales } from '../data/sales';
import type { CategoryId, SaleId } from '../types';

interface HomePageProps {
  onOpenCategory: (categoryId: CategoryId) => void;
  onOpenSale: (saleId: SaleId) => void;
  onOpenAllProducts: () => void;
  onSearch: (query: string) => void;
}

export function HomePage({
  onOpenCategory,
  onOpenSale,
  onOpenAllProducts,
  onSearch,
}: HomePageProps) {
  return (
    <div className="home-page">
      <p className="home-page__intro">
        Розпродажі одягу з Nike, Adidas та Puma. Оберіть категорію або конкретний розпродаж — ми сформуємо замовлення для ручного викупу.
      </p>

      <div className="search-bar">
        <span className="search-bar__icon">🔍</span>
        <input
          type="search"
          placeholder="Пошук товарів..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch((e.target as HTMLInputElement).value);
            }
          }}
        />
      </div>

      <section className="home-section">
        <div className="home-section__header">
          <h2>Категорії</h2>
          <button type="button" className="link-btn" onClick={onOpenAllProducts}>
            Усі товари →
          </button>
        </div>
        <div className="home-grid">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="home-card"
              onClick={() => onOpenCategory(cat.id)}
            >
              <span className="home-card__emoji">{cat.emoji}</span>
              <span className="home-card__title">{cat.name}</span>
              <span className="home-card__count">{countProductsByCategory(cat.id)} товарів</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2>Актуальні розпродажі</h2>
        <div className="sale-list">
          {sales.map((sale) => (
            <button
              key={sale.id}
              type="button"
              className="sale-card"
              onClick={() => onOpenSale(sale.id)}
            >
              <span className="sale-card__emoji">{sale.emoji}</span>
              <div className="sale-card__body">
                <h3>{sale.name}</h3>
                <p>{sale.description}</p>
                <span className="sale-card__count">
                  {countProductsBySale(sale.id)} товарів у каталозі
                </span>
              </div>
              <span className="sale-card__arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
