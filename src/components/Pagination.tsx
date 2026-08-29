import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function getPageList(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(p);
  });
  return result;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Пагінація">
      <button
        type="button"
        className="pagination-arrow"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Попередня сторінка"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>

      {getPageList(page, totalPages).map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pagination-page ${item === page ? 'active' : ''}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className="pagination-arrow"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Наступна сторінка"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </nav>
  );
}
