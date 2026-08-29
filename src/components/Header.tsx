import { useEffect, useRef } from 'react';
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Mobile keyboards don't dismiss themselves when the user starts scrolling
  // the page — do it manually so the keyboard doesn't cover content underneath.
  useEffect(() => {
    const handleScroll = () => {
      if (document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
              ref={searchInputRef}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={onSearchFocus}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
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
