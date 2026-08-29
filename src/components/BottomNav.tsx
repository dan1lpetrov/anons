import { Home, LayoutGrid, ShoppingCart } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTelegramContext } from '../hooks/useTelegram';

interface BottomNavProps {
  cartCount: number;
}

const TABS = [
  { to: '/', end: true, label: 'Головна', icon: Home },
  { to: '/catalog', end: false, label: 'Каталог', icon: LayoutGrid },
  { to: '/cart', end: true, label: 'Кошик', icon: ShoppingCart },
];

export function BottomNav({ cartCount }: BottomNavProps) {
  const { haptic } = useTelegramContext();

  return (
    <nav className="bottom-nav" aria-label="Основна навігація">
      {TABS.map(({ to, end, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => haptic('light')}
          className={({ isActive }) => `bottom-nav__tab ${isActive ? 'active' : ''}`}
        >
          <span className="bottom-nav__icon-wrap">
            <Icon size={22} strokeWidth={2} />
            {to === '/cart' && cartCount > 0 && <span className="bottom-nav__badge">{cartCount}</span>}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
