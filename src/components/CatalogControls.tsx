import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { CatalogFilters, Sale, SortOption } from '../types';
import type { AvailableSizes } from '../utils/catalog';
import { SizeChips } from './SizeChips';

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CatalogSearch({ value, onChange }: SearchProps) {
  const updateSearch = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);

  return (
    <label className="catalog-search">
      <Search size={18} strokeWidth={2} aria-hidden="true" />
      <input value={value} onChange={updateSearch} type="search" placeholder="Пошук товарів..." />
      {value && <button type="button" aria-label="Очистити пошук" onClick={() => onChange('')}><X size={16} strokeWidth={2} /></button>}
    </label>
  );
}

interface CatalogControlsProps {
  filters: CatalogFilters;
  sort: SortOption;
  sizes: AvailableSizes;
  brands: Sale[];
  resultCount: number;
  onFiltersChange: (filters: CatalogFilters) => void;
  onSortChange: (sort: SortOption) => void;
  onReset: () => void;
  children: ReactNode;
}

const sortLabels: Record<SortOption, string> = {
  recommended: 'За рекомендацією',
  'price-desc': 'Від дорожчих',
  'price-asc': 'Від дешевших',
};

export function CatalogControls({ filters, sort, sizes, brands, resultCount, onFiltersChange, onSortChange, onReset, children }: CatalogControlsProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCount = filters.sizes.length + filters.brands.length;

  const toggle = (field: 'sizes' | 'brands', value: string) => {
    const values = filters[field] as string[];
    onFiltersChange({ ...filters, [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] } as CatalogFilters);
  };

  const filterGroups = (
    <>
      <FilterGroup title="Бренд">
        {brands.map((brand) => <button key={brand.id} type="button" className={`filter-chip ${filters.brands.includes(brand.id) ? 'active' : ''}`} onClick={() => toggle('brands', brand.id)}>{brand.name}</button>)}
      </FilterGroup>
      {sizes.clothing.regular.length > 0 && (
        <FilterGroup title="Розмір · одяг">
          <SizeChips
            sizes={sizes.clothing.regular}
            isActive={(size) => filters.sizes.includes(size)}
            onSelect={(size) => toggle('sizes', size)}
            wrapperClassName="filter-chips"
            chipClassName="filter-chip filter-chip--size"
          />
        </FilterGroup>
      )}
      {sizes.clothing.tall.length > 0 && (
        <FilterGroup title="Розмір · Tall">
          <SizeChips
            sizes={sizes.clothing.tall}
            isActive={(size) => filters.sizes.includes(size)}
            onSelect={(size) => toggle('sizes', size)}
            wrapperClassName="filter-chips"
            chipClassName="filter-chip filter-chip--size"
          />
        </FilterGroup>
      )}
      {sizes.shoes.length > 0 && (
        <FilterGroup title="Розмір · взуття">
          <SizeChips
            sizes={sizes.shoes}
            isActive={(size) => filters.sizes.includes(size)}
            onSelect={(size) => toggle('sizes', size)}
            wrapperClassName="filter-chips"
            chipClassName="filter-chip filter-chip--size"
          />
        </FilterGroup>
      )}
      {sizes.accessories.length > 0 && (
        <FilterGroup title="Розмір · аксесуари">
          <SizeChips
            sizes={sizes.accessories}
            isActive={(size) => filters.sizes.includes(size)}
            onSelect={(size) => toggle('sizes', size)}
            wrapperClassName="filter-chips"
            chipClassName="filter-chip filter-chip--size"
          />
        </FilterGroup>
      )}
    </>
  );

  const sortSelect = (
    <select
      className="sort-select"
      aria-label="Сортування"
      value={sort}
      onChange={(event) => onSortChange(event.target.value as SortOption)}
    >
      {(Object.keys(sortLabels) as SortOption[]).map((option) => (
        <option key={option} value={option}>{sortLabels[option]}</option>
      ))}
    </select>
  );

  return (
    <>
      <aside className="catalog-sidebar" aria-label="Фільтри та сортування">
        <div className="catalog-sidebar__section">
          <h3>Сортування</h3>
          {sortSelect}
        </div>
        <div className="catalog-sidebar__section">
          <div className="catalog-sidebar__header">
            <h2>Фільтри</h2>
            {activeCount > 0 && <button type="button" className="sheet-reset" onClick={onReset}>Скинути</button>}
          </div>
          {filterGroups}
        </div>
      </aside>

      <div className="catalog-content">
        <div className="catalog-toolbar-wrap">
          <div className="catalog-toolbar">
            <button className="toolbar-button" type="button" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" /> Фільтри
              {activeCount > 0 && <b>{activeCount}</b>}
            </button>
            {sortSelect}
          </div>
          <div className="catalog-results">
            <span>Знайдено <strong>{resultCount}</strong> товарів</span>
            {sort !== 'recommended' && <span className="sort-summary">{sortLabels[sort]}</span>}
          </div>

          {filtersOpen && (
            <div className="sheet-backdrop" role="presentation" onClick={() => setFiltersOpen(false)}>
              <section className="catalog-sheet" role="dialog" aria-modal="true" aria-label="Фільтри" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-handle" />
                <header className="sheet-header">
                  <h2>Фільтри</h2>
                  <button type="button" aria-label="Закрити" onClick={() => setFiltersOpen(false)}><X size={20} strokeWidth={2} /></button>
                </header>

                <div className="sheet-content">{filterGroups}</div>

                <footer className="sheet-footer">
                  <button type="button" className="sheet-reset" onClick={onReset}>Скинути</button>
                  <button type="button" className="btn-primary sheet-apply" onClick={() => setFiltersOpen(false)}>Показати {resultCount} товарів</button>
                </footer>
              </section>
            </div>
          )}
        </div>

        {children}
      </div>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="filter-section"><h3>{title}</h3><div className="filter-chips">{children}</div></div>;
}
