import { useState } from 'react';
import type { OrderForm } from '../types';
import { formatPrice } from '../utils/format';

interface CheckoutFormProps {
  totalPrice: number;
  itemCount: number;
  defaultName?: string;
  onSubmit: (form: OrderForm) => void;
}

export function CheckoutForm({
  totalPrice,
  itemCount,
  defaultName = '',
  onSubmit,
}: CheckoutFormProps) {
  const [form, setForm] = useState<OrderForm>({
    name: defaultName,
    phone: '',
    comment: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    onSubmit(form);
  };

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <div className="checkout-summary-card">
        <p>{itemCount} {itemCount === 1 ? 'товар' : itemCount < 5 ? 'товари' : 'товарів'}</p>
        <strong>{formatPrice(totalPrice)}</strong>
      </div>

      <div className="form-field">
        <label htmlFor="name">Ім'я *</label>
        <input
          id="name"
          type="text"
          placeholder="Ваше ім'я"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="phone">Телефон *</label>
        <input
          id="phone"
          type="tel"
          placeholder="+380 XX XXX XX XX"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="comment">Коментар</label>
        <textarea
          id="comment"
          placeholder="Додаткові побажання (необов'язково)"
          rows={3}
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
        />
      </div>

      <div className="info-box">
        <p>
          Після підтвердження замовлення буде збережено у txt-файл. Ви (або адміністратор) зможете вручну викупити товари на сайтах-джерелах за посиланнями з файлу.
        </p>
      </div>

      <button type="submit" className="btn-primary btn-full">
        Підтвердити замовлення
      </button>
    </form>
  );
}
