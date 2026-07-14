import { formatPrice } from '../utils/format';
import type { useCart } from '../hooks/useCart';

type EnrichedItems = ReturnType<typeof useCart>['enrichedItems'];

interface CartViewProps {
  items: EnrichedItems;
  totalPrice: number;
  onUpdateQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onCheckout: () => void;
}

export function CartView({
  items,
  totalPrice,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: CartViewProps) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon">🛒</span>
        <h2>Кошик порожній</h2>
        <p>Оберіть товари з каталогу</p>
      </div>
    );
  }

  return (
    <div className="cart-view">
      <ul className="cart-list">
        {items.map(({ key, product, color, item, lineTotal }) => (
          <li key={key} className="cart-item">
            <img src={product.image} alt={product.name} className="cart-item__thumb" />
            <div className="cart-item__info">
              <h3>{product.name}</h3>
              <p className="cart-item__meta">
                {color.name} · {item.size}
              </p>
              <p className="cart-item__price">{formatPrice(lineTotal)}</p>
              <div className="cart-item__actions">
                <div className="quantity-control quantity-control--sm">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(key, item.quantity - 1)}
                    aria-label="Зменшити"
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(key, item.quantity + 1)}
                    aria-label="Збільшити"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-text-danger"
                  onClick={() => onRemove(key)}
                >
                  Видалити
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="cart-summary">
        <div className="cart-summary__row">
          <span>Разом</span>
          <strong>{formatPrice(totalPrice)}</strong>
        </div>
        <p className="cart-summary__note">
          Оплата не проводиться тут. Після оформлення ви отримаєте список товарів для ручного викупу на сайтах-джерелах.
        </p>
        <button type="button" className="btn-primary btn-full" onClick={onCheckout}>
          Оформити замовлення
        </button>
      </div>
    </div>
  );
}
