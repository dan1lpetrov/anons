import type { Sale } from '../types';

export const sales: Sale[] = [
  {
    id: 'nike',
    name: 'Nike',
    emoji: '👟',
    description: 'Розпродаж кросівок, одягу та аксесуарів Nike',
    url: 'https://www.nike.com/sale',
  },
  {
    id: 'adidas',
    name: 'Adidas',
    emoji: '⚽',
    description: 'Outlet Adidas — знижки на весь асортимент',
    url: 'https://www.adidas.com/outlet',
  },
  {
    id: 'puma',
    name: 'Puma',
    emoji: '🐆',
    description: 'Актуальний розпродаж Puma зі знижками до 50%',
    url: 'https://eu.puma.com/uk/en/sports/sale',
  },
];

export function getSaleById(id: string): Sale | undefined {
  return sales.find((s) => s.id === id);
}
