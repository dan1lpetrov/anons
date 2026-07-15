import { useState } from 'react';
import { formatPrice } from '../utils/format';
import type { useCart } from '../hooks/useCart';

type EnrichedItems = ReturnType<typeof useCart>['enrichedItems'];

interface CartViewProps {
  items: EnrichedItems;
  totalPrice: number;
  onUpdateQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onCheckout: (comment: string) => void;
}

export function CartView({
  items,
  totalPrice,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: CartViewProps) {
  const [comment, setComment] = useState('');

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
        <div className="form-field cart-comment-field">
          <label htmlFor="comment">Коментар</label>
          <textarea
            id="comment"
            placeholder="Додаткові побажання (необов'язково)"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
        <button type="button" className="btn-primary btn-full" onClick={() => onCheckout(comment.trim())}>
          Оформити замовлення
        </button>
      </div>
    </div>
  );
}
