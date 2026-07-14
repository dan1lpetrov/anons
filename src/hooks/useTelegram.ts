import { useEffect, useMemo } from 'react';

export function useTelegram() {
  const tg = useMemo(() => window.Telegram?.WebApp, []);

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, [tg]);

  const user = tg?.initDataUnsafe?.user;
  const isTelegram = Boolean(tg?.initData);

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
