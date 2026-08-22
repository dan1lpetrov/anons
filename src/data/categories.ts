const CATEGORY_LABELS: Record<string, string> = {
  shoes: 'Взуття',
  clothing: 'Одяг',
  accessories: 'Аксесуари',
  tshirts: 'Футболки',
  pants: 'Штани',
  jackets: 'Куртки',
};

const CATEGORY_EMOJI: Record<string, string> = {
  shoes: '👟',
  clothing: '👕',
  accessories: '🎒',
  tshirts: '👕',
  pants: '👖',
  jackets: '🧥',
};

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? id;
}

export function categoryEmoji(id: string): string {
  return CATEGORY_EMOJI[id] ?? '🏷️';
}
