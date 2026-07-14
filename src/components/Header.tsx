interface HeaderProps {
  title: string;
  cartCount: number;
  showCart: boolean;
  onCartClick: () => void;
}

export function Header({ title, cartCount, showCart, onCartClick }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo">A</span>
        <h1>{title}</h1>
      </div>
      {showCart && (
        <button type="button" className="cart-button" onClick={onCartClick} aria-label="Кошик">
          🛒
          {cartCount > 0 && <span className="cart-button__badge">{cartCount}</span>}
        </button>
      )}
    </header>
  );
}
