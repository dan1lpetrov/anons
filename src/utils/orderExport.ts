import type { Order } from '../types';

export function formatOrderText(order: Order): string {
  const lines: string[] = [
    '═══════════════════════════════════════',
    '         ЗАМОВЛЕННЯ ANONS SHOP',
    '═══════════════════════════════════════',
    '',
    `Номер:     ${order.id}`,
    `Дата:      ${new Date(order.createdAt).toLocaleString('uk-UA')}`,
    '',
  ];

  if (order.customer.comment) {
    lines.push('── Коментар ────────────────────────────');
    lines.push(`Коментар:  ${order.customer.comment}`);
  }

  if (order.telegramUser) {
    lines.push('');
    lines.push('── Telegram ────────────────────────────');
    lines.push(`ID:        ${order.telegramUser.id}`);
    if (order.telegramUser.username) {
      lines.push(`Username:  @${order.telegramUser.username}`);
    }
    lines.push(`Ім'я:      ${order.telegramUser.first_name}${order.telegramUser.last_name ? ' ' + order.telegramUser.last_name : ''}`);
  }

  lines.push('');
  lines.push('── Товари ──────────────────────────────');

  order.items.forEach((entry, index) => {
    lines.push('');
    lines.push(`${index + 1}. ${entry.product.name}`);
    lines.push(`   Розмір:    ${entry.size}`);
    lines.push(`   Колір:     ${entry.color.name}`);
    lines.push(`   Кількість: ${entry.quantity}`);
    lines.push(`   Ціна:      ${entry.product.price} ₴ × ${entry.quantity} = ${entry.lineTotal} ₴`);
    lines.push(`   Джерело:   ${entry.product.sourceName}`);
    lines.push(`   Посилання: ${entry.product.sourceUrl}`);
  });

  lines.push('');
  lines.push('───────────────────────────────────────');
  lines.push(`РАЗОМ: ${order.total} ₴`);
  lines.push('');
  lines.push('⚠️  Увага: це замовлення для ручного викупу');
  lines.push('    на сайтах-джерелах. Оплата не проводиться');
  lines.push('    через цей додаток.');
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

export function saveOrderToLocalStorage(order: Order): void {
  const key = 'anons-orders';
  const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Order[];
  existing.push(order);
  localStorage.setItem(key, JSON.stringify(existing));
}

export function createOrderId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AN-${date}-${time}-${rand}`;
}
