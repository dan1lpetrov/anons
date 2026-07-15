import { useEffect, useRef, useState } from 'react';

interface HeaderProps {
  title: string;
  cartCount: number;
  showCart: boolean;
  onCartClick: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onHomeClick: () => void;
}

export function Header({ title, cartCount, showCart, onCartClick, searchValue, onSearchChange, onHomeClick }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <header className="app-header">
      <button type="button" className="app-header__brand" onClick={onHomeClick} aria-label="На головну">
        <span className="app-header__logo">A</span>
        <h1>{title}</h1>
      </button>
      {showCart && (
        <button type="button" className="header-search-button" onClick={() => setSearchOpen(true)} aria-label="Пошук">
          ⌕
        </button>
      )}
      {showCart && (
        <button type="button" className="cart-button" onClick={onCartClick} aria-label="Кошик">
          🛒
          {cartCount > 0 && <span className="cart-button__badge">{cartCount}</span>}
        </button>
      )}
      {searchOpen && (
        <div className="header-search-overlay">
          <button type="button" className="header-search-overlay__back" onClick={() => setSearchOpen(false)} aria-label="Закрити пошук">‹</button>
          <label>
            <span aria-hidden="true">⌕</span>
            <input ref={inputRef} value={searchValue} onChange={(event) => onSearchChange(event.target.value)} type="search" placeholder="Пошук товарів..." />
          </label>
          {searchValue && <button type="button" className="header-search-overlay__clear" onClick={() => onSearchChange('')} aria-label="Очистити пошук">×</button>}
        </div>
      )}
    </header>
  );
}
