import { Search, ShoppingCart, X } from 'lucide-react';

interface HeaderProps {
  title: string;
  cartCount: number;
  showCart: boolean;
  showSearch: boolean;
  onCartClick: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchFocus?: () => void;
  onHomeClick: () => void;
}

export function Header({
  title,
  cartCount,
  showCart,
  showSearch,
  onCartClick,
  searchValue,
  onSearchChange,
  onSearchFocus,
  onHomeClick,
}: HeaderProps) {
  return (
    <header className="app-header-wrap">
      <div className="app-header">
        <button type="button" className="app-header__brand" onClick={onHomeClick} aria-label="На головну">
          <span className="app-header__logo">A</span>
          <h1>{title}</h1>
        </button>
        {showCart && (
          <button type="button" className="cart-button" onClick={onCartClick} aria-label="Кошик">
            <ShoppingCart size={20} strokeWidth={2} />
            {cartCount > 0 && <span className="cart-button__badge">{cartCount}</span>}
          </button>
        )}
      </div>
      {showSearch && (
        <div className="app-header__search-row">
          <label className="catalog-search">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={onSearchFocus}
              type="search"
              placeholder="Пошук товарів..."
            />
            {searchValue && (
              <button type="button" aria-label="Очистити пошук" onClick={() => onSearchChange('')}>
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </label>
        </div>
      )}
    </header>
  );
}
