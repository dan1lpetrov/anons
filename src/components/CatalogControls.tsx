import { useState, type ChangeEvent, type ReactNode } from 'react';
import type { CatalogFilters, ProductColor, Sale, SortOption } from '../types';

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CatalogSearch({ value, onChange }: SearchProps) {
  const updateSearch = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);

  return (
    <label className="catalog-search">
      <span aria-hidden="true">⌕</span>
      <input value={value} onChange={updateSearch} type="search" placeholder="Пошук товарів..." />
      {value && <button type="button" aria-label="Очистити пошук" onClick={() => onChange('')}>×</button>}
    </label>
  );
}

interface CatalogControlsProps {
  filters: CatalogFilters;
  sort: SortOption;
  sizes: string[];
  colors: ProductColor[];
  brands: Sale[];
  resultCount: number;
  onFiltersChange: (filters: CatalogFilters) => void;
  onSortChange: (sort: SortOption) => void;
  onReset: () => void;
}

const sortLabels: Record<SortOption, string> = {
  recommended: 'За рекомендацією',
  'price-desc': 'Від дорожчих',
  'price-asc': 'Від дешевших',
};

export function CatalogControls({ filters, sort, sizes, colors, brands, resultCount, onFiltersChange, onSortChange, onReset }: CatalogControlsProps) {
  const [panel, setPanel] = useState<'filters' | 'sort' | null>(null);
  const activeCount = filters.sizes.length + filters.colors.length + filters.brands.length;

  const toggle = (field: 'sizes' | 'colors' | 'brands', value: string) => {
    const values = filters[field] as string[];
    onFiltersChange({ ...filters, [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] } as CatalogFilters);
  };

  return (
    <section className="catalog-controls" aria-label="Керування каталогом">
      <div className="catalog-toolbar">
        <button className="toolbar-button" type="button" onClick={() => setPanel('filters')}>
          <span aria-hidden="true">☷</span> Фільтри
          {activeCount > 0 && <b>{activeCount}</b>}
        </button>
        <button className="toolbar-button" type="button" onClick={() => setPanel('sort')}>
          <span aria-hidden="true">↕</span> Сортувати
        </button>
      </div>
      <div className="catalog-results">
        <span>Знайдено <strong>{resultCount}</strong> товарів</span>
        {sort !== 'recommended' && <span className="sort-summary">{sortLabels[sort]}</span>}
      </div>

      {panel && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setPanel(null)}>
          <section className="catalog-sheet" role="dialog" aria-modal="true" aria-label={panel === 'filters' ? 'Фільтри' : 'Сортування'} onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <header className="sheet-header">
              <h2>{panel === 'filters' ? 'Фільтри' : 'Сортування'}</h2>
              <button type="button" aria-label="Закрити" onClick={() => setPanel(null)}>×</button>
            </header>

            {panel === 'filters' ? (
              <div className="sheet-content">
                <FilterGroup title="Бренд">
                  {brands.map((brand) => <button key={brand.id} type="button" className={`filter-chip ${filters.brands.includes(brand.id) ? 'active' : ''}`} onClick={() => toggle('brands', brand.id)}>{brand.name}</button>)}
                </FilterGroup>
                <FilterGroup title="Розмір">
                  {sizes.map((size) => <button key={size} type="button" className={`filter-chip filter-chip--size ${filters.sizes.includes(size) ? 'active' : ''}`} onClick={() => toggle('sizes', size)}>{size}</button>)}
                </FilterGroup>
                <FilterGroup title="Колір">
                  {colors.map((color) => <button key={color.id} type="button" className={`filter-chip filter-chip--color ${filters.colors.includes(color.id) ? 'active' : ''}`} onClick={() => toggle('colors', color.id)}><i style={{ backgroundColor: color.hex }} aria-hidden="true" />{color.name}</button>)}
                </FilterGroup>
              </div>
            ) : (
              <div className="sort-options">
                {(Object.keys(sortLabels) as SortOption[]).map((option) => <button key={option} className={`sort-option ${sort === option ? 'active' : ''}`} type="button" onClick={() => { onSortChange(option); setPanel(null); }}><span>{sortLabels[option]}</span><i aria-hidden="true">✓</i></button>)}
              </div>
            )}

            {panel === 'filters' && <footer className="sheet-footer"><button type="button" className="sheet-reset" onClick={onReset}>Скинути</button><button type="button" className="btn-primary sheet-apply" onClick={() => setPanel(null)}>Показати {resultCount} товарів</button></footer>}
          </section>
        </div>
      )}
    </section>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="filter-section"><h3>{title}</h3><div className="filter-chips">{children}</div></div>;
}
