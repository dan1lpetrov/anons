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

  // Plain .blur() doesn't reliably dismiss the on-screen keyboard inside
  // Telegram's iOS WebView — it keeps the field logically focused for layout
  // purposes. Toggling readonly/disabled forces the native responder to
  // actually resign before restoring the field so it's still editable next tap.
  const dismissKeyboard = () => {
    const input = searchInputRef.current;
    if (!input) return;
    input.setAttribute('readonly', 'readonly');
    input.setAttribute('disabled', 'true');
    input.blur();
    setTimeout(() => {
      input.removeAttribute('readonly');
      input.removeAttribute('disabled');
    }, 100);
  };

  // Mobile keyboards don't dismiss themselves when the user starts scrolling
  // the page — do it manually so the keyboard doesn't cover content underneath.
  // Listening on 'scroll' doesn't work inside Telegram's iOS WebView: iOS only
  // honors a keyboard-dismissing blur() when it's triggered from a direct,
  // trusted touch event, and 'scroll' fires later/async (often during momentum),
  // which iOS doesn't count as one. 'touchmove' fires the instant the drag starts.
  useEffect(() => {
    const handleTouchMove = () => {
      if (document.activeElement === searchInputRef.current) {
        dismissKeyboard();
      }
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => window.removeEventListener('touchmove', handleTouchMove);
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
                if (event.key === 'Enter') dismissKeyboard();
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
