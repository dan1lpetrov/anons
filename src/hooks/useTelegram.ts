import { useEffect, useMemo } from 'react';

export function useTelegram() {
  const tg = useMemo(() => window.Telegram?.WebApp, []);

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
  }, [tg]);

  const user = tg?.initDataUnsafe?.user;
  const isTelegram = Boolean(tg?.initData);

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
    isTelegram,
    colorScheme: tg?.colorScheme ?? 'light',
    haptic,
    sendOrderData,
    showAlert,
    close: () => tg?.close(),
  };
}
