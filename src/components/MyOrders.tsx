import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { useTelegramContext } from '../hooks/useTelegram';
import type { MyOrder } from '../types';
import { formatPrice } from '../utils/format';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function StatusPill({ label, done }: { label: string; done: boolean }) {
  return <span className={`status-pill ${done ? 'status-pill--done' : ''}`}>{label}</span>;
}

export function MyOrders() {
  const { initData, isTelegram } = useTelegramContext();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isTelegram) return;
    let cancelled = false;
    fetch('/api/orders?mine=1', { headers: { 'X-Telegram-Init-Data': initData } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MyOrder[]) => {
        if (!cancelled) setOrders(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isTelegram, initData]);

  // Outside Telegram there's no verifiable identity at all (initData is empty) — the API would
  // just 401, so skip the request and explain why instead of showing a generic error.
  if (!isTelegram) {
    return (
      <div className="empty-state">
        <Receipt className="empty-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" />
        <h2>Доступно в Telegram</h2>
        <p>Відкрий магазин через Telegram, щоб бачити свої замовлення.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <Receipt className="empty-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" />
        <h2>Не вдалося завантажити</h2>
        <p>Спробуй відкрити цей розділ ще раз.</p>
      </div>
    );
  }

  if (orders === null) {
    return <div className="empty-state"><p>Завантаження...</p></div>;
  }

  if (orders.length === 0) {
    return (
      <div className="empty-state">
        <Receipt className="empty-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" />
        <h2>Ще немає замовлень</h2>
        <p>Тут з'являться твої замовлення після першої покупки.</p>
      </div>
    );
  }

  return (
    <div className="my-orders">
      {orders.map((order) => (
        <section key={order.id} className="my-order-card">
          <header className="my-order-card__header">
            <div>
              <span className="my-order-card__id">№ {order.id}</span>
              <span className="my-order-card__date">{formatDate(order.createdAt)}</span>
            </div>
            <div className="my-order-card__badges">
              <StatusPill label={order.paid ? 'Оплачено' : 'Не оплачено'} done={order.paid} />
              <StatusPill label={order.redeemed ? 'Викуплено' : 'Не викуплено'} done={order.redeemed} />
            </div>
          </header>

          <ul className="success-order-list">
            {order.items.map((item) => (
              <li key={item.id}>
                <img src={item.productImage ?? ''} alt={item.productName} />
                <div>
                  <strong>{item.productName}</strong>
                  <span>
                    {item.colorName ? `${item.colorName} · ` : ''}
                    {item.size} · {item.quantity} шт.
                  </span>
                </div>
                <b>{formatPrice(item.unitPrice * item.quantity, order.currency ?? undefined)}</b>
              </li>
            ))}
          </ul>

          <div className="my-order-card__total">
            <span>Разом</span>
            <strong>{formatPrice(order.total, order.currency ?? undefined)}</strong>
          </div>
        </section>
      ))}
    </div>
  );
}
