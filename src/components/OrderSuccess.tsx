import type { Order } from '../types';
import { formatPrice } from '../utils/format';

interface OrderSuccessProps {
  order: Order;
  sentToTelegram: boolean;
  onContinue: () => void;
}

export function OrderSuccess({ order, sentToTelegram, onContinue }: OrderSuccessProps) {
  return (
    <div className="success-view">
      <div className="success-icon">✓</div>
      <h2>Замовлення оформлено!</h2>
      <p className="success-id">№ {order.id}</p>

      <div className="success-details">
        <p>Разом: <strong>{formatPrice(order.total)}</strong></p>
        <p>{order.items.length} позицій у замовленні</p>
      </div>

      <ul className="success-actions-list">
        <li>📄 Txt-файл завантажено на ваш пристрій</li>
        <li>💾 Замовлення збережено локально</li>
        {sentToTelegram && <li>📨 Дані надіслано в Telegram-бот</li>}
      </ul>

      <p className="success-note">
        Перевірте папку «Завантаження» для файлу <code>order-{order.id}.txt</code>
      </p>

      <button type="button" className="btn-primary btn-full" onClick={onContinue}>
        Повернутись до каталогу
      </button>
    </div>
  );
}
