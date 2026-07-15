import type { Order } from '../types';
import { formatPrice } from '../utils/format';

interface OrderSuccessProps {
  order: Order;
  onContinue: () => void;
}

export function OrderSuccess({ order, onContinue }: OrderSuccessProps) {
  return (
    <div className="success-view">
      <div className="success-icon">✓</div>
      <h2>Замовлення оформлено!</h2>
      <p className="success-id">№ {order.id}</p>

      <div className="success-details">
        <p>Разом: <strong>{formatPrice(order.total)}</strong></p>
        <p>{order.items.length} позицій у замовленні</p>
      </div>

      <h3 className="success-order-title">Ваше замовлення</h3>
      <ul className="success-order-list">
        {order.items.map((item) => (
          <li key={`${item.product.id}-${item.size}-${item.color.id}`}>
            <img src={item.product.image} alt={item.product.name} />
            <div>
              <strong>{item.product.name}</strong>
              <span>{item.color.name} · {item.size} · {item.quantity} шт.</span>
            </div>
            <b>{formatPrice(item.lineTotal)}</b>
          </li>
        ))}
      </ul>

      <p className="success-note">Дякуємо! Ми отримали ваше замовлення.</p>

      <button type="button" className="btn-primary btn-full" onClick={onContinue}>
        Повернутись до каталогу
      </button>
    </div>
  );
}
