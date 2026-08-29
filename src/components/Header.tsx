import { Search, X } from 'lucide-react';

interface HeaderProps {
  showSearch: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchFocus?: () => void;
  onHomeClick: () => void;
}

export function Header({
  showSearch,
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
        </button>
        {showSearch && (
          <label className="catalog-search app-header__search">
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
        )}
      </div>
    </header>
  );
}
