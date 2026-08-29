import { Home, LayoutGrid, ShoppingCart } from 'lucide-react';
import type { Screen } from '../types';

interface BottomNavProps {
  active: Screen;
  cartCount: number;
  onNavigate: (screen: Screen) => void;
}

const TABS: Array<{ screen: Screen; label: string; icon: typeof Home }> = [
  { screen: 'home', label: 'Головна', icon: Home },
  { screen: 'catalog', label: 'Каталог', icon: LayoutGrid },
  { screen: 'cart', label: 'Кошик', icon: ShoppingCart },
];

export function BottomNav({ active, cartCount, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Основна навігація">
      {TABS.map(({ screen, label, icon: Icon }) => (
        <button
          key={screen}
          type="button"
          className={`bottom-nav__tab ${active === screen ? 'active' : ''}`}
          onClick={() => onNavigate(screen)}
        >
          <span className="bottom-nav__icon-wrap">
            <Icon size={22} strokeWidth={2} />
            {screen === 'cart' && cartCount > 0 && <span className="bottom-nav__badge">{cartCount}</span>}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
