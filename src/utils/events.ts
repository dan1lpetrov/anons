export type ProductEventType = 'view' | 'order';

interface ProductEventInput {
  productId: string;
  eventType: ProductEventType;
  orderId?: string;
  quantity?: number;
  unitPrice?: number;
}

// Fire-and-forget: telemetry must never block or fail the UI it's attached to.
// keepalive lets the request survive a navigation/unload that happens right after (e.g. checkout).
export function logProductEvents(events: ProductEventInput[], telegramUserId?: number): void {
  if (events.length === 0) return;
  const body = JSON.stringify({
    events: events.map((e) => ({
      ...e,
      telegramUserId: telegramUserId != null ? String(telegramUserId) : null,
    })),
  });
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function logProductEvent(eventType: ProductEventType, productId: string, telegramUserId?: number): void {
  logProductEvents([{ productId, eventType }], telegramUserId);
}
