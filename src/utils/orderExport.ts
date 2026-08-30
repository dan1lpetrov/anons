import type { Order } from '../types';

// order.items[].product.currency ('USD'/'UAH', see api/_lib/pricing.ts) rather than a hardcoded
// symbol — this text is what the shop owner reads to manually re-purchase on the source site,
// so it has to say the currency the price actually is in.
function currencySymbol(currency?: 'USD' | 'UAH'): string {
  return currency === 'UAH' ? '₴' : '$';
}

// UAH prices are shown site-wide without kopecks (see formatPrice) — mirror that here so the
// exported order text matches what the buyer actually saw on the product/cart screens.
function formatAmount(value: number, currency?: 'USD' | 'UAH'): number {
  return currency === 'UAH' ? Math.round(value) : value;
}

export function formatOrderText(order: Order): string {
  const symbol = currencySymbol(order.items[0]?.product.currency);
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
    const currency = entry.product.currency;
    lines.push(`   Ціна:      ${formatAmount(entry.lineTotal / entry.quantity, currency)} ${symbol} × ${entry.quantity} = ${formatAmount(entry.lineTotal, currency)} ${symbol}`);
    lines.push(`   Джерело:   ${entry.product.sourceName}`);
    lines.push(`   Посилання: ${entry.product.sourceUrl}`);
  });

  lines.push('');
  lines.push('───────────────────────────────────────');
  lines.push(`РАЗОМ: ${formatAmount(order.total, order.items[0]?.product.currency)} ${symbol}`);
  lines.push('');
  lines.push('⚠️  Увага: це замовлення для ручного викупу');
  lines.push('    на сайтах-джерелах. Оплата не проводиться');
  lines.push('    через цей додаток.');
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

const ORDERS_KEY = 'anons-orders';

export function saveOrderToLocalStorage(order: Order): void {
  const existing = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as Order[];
  existing.push(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(existing));
}

// Backs the /order/:orderId route: order confirmation has no server-side
// record (checkout doesn't process anything, see CLAUDE.md), so the only
// way to survive a refresh on that URL is looking the order back up here.
export function getOrderFromLocalStorage(orderId: string): Order | undefined {
  const existing = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as Order[];
  return existing.find((order) => order.id === orderId);
}

export function createOrderId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AN-${date}-${time}-${rand}`;
}
