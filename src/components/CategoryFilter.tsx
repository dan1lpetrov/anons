import type { CategoryId } from '../types';
import { categories } from '../data/categories';

interface CategoryFilterProps {
  active: CategoryId | 'all';
  onChange: (category: CategoryId | 'all') => void;
}

export function CategoryFilter({ active, onChange }: CategoryFilterProps) {
  return (
    <div className="category-filter">
      <button
        type="button"
        className={`category-chip ${active === 'all' ? 'active' : ''}`}
        onClick={() => onChange('all')}
      >
        Всі
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          className={`category-chip ${active === cat.id ? 'active' : ''}`}
          onClick={() => onChange(cat.id)}
        >
          <span>{cat.emoji}</span> {cat.name}
        </button>
      ))}
    </div>
  );
}
