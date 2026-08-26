import { useState } from 'react';

const MAX_VISIBLE = 8;

interface SizeChipsProps {
  sizes: string[];
  isActive: (size: string) => boolean;
  onSelect: (size: string) => void;
  wrapperClassName: string;
  chipClassName: string;
  max?: number;
}

export function SizeChips({ sizes, isActive, onSelect, wrapperClassName, chipClassName, max = MAX_VISIBLE }: SizeChipsProps) {
  const [expanded, setExpanded] = useState(false);
  if (sizes.length === 0) return null;

  const visible = expanded ? sizes : sizes.slice(0, max);
  const hiddenCount = sizes.length - visible.length;

  return (
    <div className={wrapperClassName}>
      {visible.map((s) => (
        <button
          key={s}
          type="button"
          className={`${chipClassName} ${isActive(s) ? 'active' : ''}`}
          onClick={() => onSelect(s)}
        >
          {s}
        </button>
      ))}
      {hiddenCount > 0 && (
        <button type="button" className={`${chipClassName} chip-toggle-more`} onClick={() => setExpanded(true)}>
          +{hiddenCount}
        </button>
      )}
      {expanded && sizes.length > max && (
        <button type="button" className={`${chipClassName} chip-toggle-more`} onClick={() => setExpanded(false)}>
          Згорнути
        </button>
      )}
    </div>
  );
}
