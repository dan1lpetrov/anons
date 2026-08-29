import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTelegramContext } from '../hooks/useTelegram';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { haptic } = useTelegramContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // No search box on /product or /cart etc — search is a catalog-page affordance.
  const showSearch = location.pathname === '/' || location.pathname.startsWith('/catalog');
  const onCatalog = location.pathname.startsWith('/catalog');
  const searchValue = onCatalog ? (searchParams.get('q') ?? '') : '';

  const handleSearchChange = (value: string) => {
    if (!onCatalog) {
      haptic('light');
      navigate(value ? `/catalog?q=${encodeURIComponent(value)}` : '/catalog');
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  };

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
  // The listener is attached only while the field is actually focused (added on
  // focus, removed on blur) — left mounted permanently, a window-level touchmove
  // listener interferes with Telegram's own native swipe recognizer on the
  // horizontal carousels and makes ordinary carousel swipes close the app again.
  const touchDismissHandlerRef = useRef<(() => void) | null>(null);

  const handleSearchFocus = () => {
    if (!onCatalog) {
      haptic('light');
      navigate('/catalog');
    }
    const handler = () => dismissKeyboard();
    touchDismissHandlerRef.current = handler;
    window.addEventListener('touchmove', handler, { passive: true });
  };

  const handleSearchBlur = () => {
    if (touchDismissHandlerRef.current) {
      window.removeEventListener('touchmove', touchDismissHandlerRef.current);
      touchDismissHandlerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (touchDismissHandlerRef.current) window.removeEventListener('touchmove', touchDismissHandlerRef.current);
    },
    [],
  );

  return (
    <header className="app-header-wrap">
      <div className="app-header">
        <button type="button" className="app-header__brand" onClick={() => { haptic('light'); navigate('/'); }} aria-label="На головну">
          <span className="app-header__logo">A</span>
        </button>
        {showSearch && (
          <label className="catalog-search app-header__search">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onKeyDown={(event) => {
                if (event.key === 'Enter') dismissKeyboard();
              }}
              type="search"
              placeholder="Пошук товарів..."
            />
            {searchValue && (
              <button type="button" aria-label="Очистити пошук" onClick={() => handleSearchChange('')}>
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </label>
        )}
      </div>
    </header>
  );
}
