import { createContext, useContext, useEffect, useMemo } from 'react';

export function useTelegram() {
  const tg = useMemo(() => window.Telegram?.WebApp, []);

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
  }, [tg]);

  const user = tg?.initDataUnsafe?.user;
  const initData = tg?.initData ?? '';
  const isTelegram = Boolean(initData);

  // Inside real Telegram, follow the client's live theme instead of the browser's
  // prefers-color-scheme (Telegram controls the actual theme the user sees). Outside
  // Telegram, window.Telegram.WebApp still exists as the SDK's own stub (always
  // colorScheme: 'light'), so this must gate on isTelegram, not just `tg` being set —
  // otherwise every non-Telegram visitor gets forced into light mode.
  useEffect(() => {
    if (!tg || !isTelegram) return;
    const syncTheme = () => {
      document.documentElement.setAttribute('data-theme', tg.colorScheme === 'dark' ? 'dark' : 'light');
    };
    syncTheme();
    tg.onEvent?.('themeChanged', syncTheme);
    return () => tg.offEvent?.('themeChanged', syncTheme);
  }, [tg, isTelegram]);

  const haptic = (type: 'light' | 'success' | 'error' = 'light') => {
    if (!tg?.HapticFeedback) return;
    if (type === 'success' || type === 'error') {
      tg.HapticFeedback.notificationOccurred(type);
    } else {
      tg.HapticFeedback.impactOccurred('light');
    }
  };

  const sendOrderData = (data: string) => {
    if (tg?.sendData) {
      tg.sendData(data);
      return true;
    }
    return false;
  };

  const openLink = (url: string) => {
    if (tg?.openLink) {
      tg.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const showAlert = (message: string) => {
    if (tg?.showAlert) {
      tg.showAlert(message);
    } else {
      alert(message);
    }
  };

  return {
    tg,
    user,
    initData,
    isTelegram,
    colorScheme: tg?.colorScheme ?? 'light',
    haptic,
    sendOrderData,
    showAlert,
    openLink,
    close: () => tg?.close(),
  };
}

// A handful of nav-triggering components (BottomNav, Header, CategoryFilter)
// live outside App.tsx's own useTelegram() call — this lets them fire the same
// tap haptic without each mounting a second, independent Telegram SDK binding.
export const TelegramContext = createContext<ReturnType<typeof useTelegram> | null>(null);

export function useTelegramContext() {
  const ctx = useContext(TelegramContext);
  if (!ctx) throw new Error('useTelegramContext must be used within <TelegramContext.Provider>');
  return ctx;
}
