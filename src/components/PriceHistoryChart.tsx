import { useState } from 'react';
import { formatPrice } from '../utils/format';

interface PricePoint {
  price: number;
  recordedAt: string | null;
}

interface PriceHistoryChartProps {
  points: PricePoint[];
}

const WIDTH = 280;
const HEIGHT = 64;
const PAD_X = 16;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
// With exactly two points (the common cold-start case), stretching them to
// the full width reads as a long timeline when it's really just "before/after" —
// keep them a fixed distance apart instead and leave the rest of the chart empty.
const TWO_POINT_GAP = 100;

function formatPointDate(recordedAt: string | null, withYear = false): string {
  if (!recordedAt) return 'було';
  return new Date(recordedAt).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

function pickTickIndices(count: number): number[] {
  const tickCount = Math.min(4, count);
  if (tickCount <= 1) return [0];
  const indices = Array.from({ length: tickCount }, (_, i) => Math.round((i * (count - 1)) / (tickCount - 1)));
  return [...new Set(indices)];
}

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = WIDTH - PAD_X * 2;
  const isPair = points.length === 2;

  // Real history has a recordedAt for every point; the synthesized
  // original->sale cold-start pair has `null` for its first point, so we
  // fall back to even spacing there since there's no real duration to plot.
  const hasAllDates = points.every((p) => p.recordedAt !== null);
  const times = hasAllDates ? points.map((p) => new Date(p.recordedAt as string).getTime()) : [];
  const t0 = times[0];
  const tSpan = times.length ? times[times.length - 1] - t0 || 1 : 1;

  const coords = points.map((p, i) => {
    let x: number;
    if (isPair) {
      x = i === 0 ? PAD_X : PAD_X + TWO_POINT_GAP;
    } else {
      const xFrac = hasAllDates ? (times[i] - t0) / tSpan : i / (points.length - 1);
      x = PAD_X + xFrac * plotWidth;
    }
    return {
      ...p,
      x,
      y: PAD_TOP + plotHeight - ((p.price - min) / span) * plotHeight,
    };
  });

  // Step-after path: price holds at its value until the moment it changes.
  let stepPath = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    stepPath += ` L ${coords[i].x} ${coords[i - 1].y} L ${coords[i].x} ${coords[i].y}`;
  }

  const tickIndices = pickTickIndices(coords.length);
  const active = activeIndex !== null ? coords[activeIndex] : null;

  return (
    <div className="price-history">
      <p className="price-history__label">Історія ціни</p>
      <div className="price-history__chart-wrap">
        <span className="price-history__gridlabel">{formatPrice(max)}</span>
        <div className="price-history__plot" style={{ height: HEIGHT }}>
          <svg className="price-history__chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            <line className="price-history__gridline" x1={0} y1={PAD_TOP} x2={WIDTH} y2={PAD_TOP} />
            <line className="price-history__gridline" x1={0} y1={HEIGHT - PAD_BOTTOM} x2={WIDTH} y2={HEIGHT - PAD_BOTTOM} />
            <path className="price-history__line" d={stepPath} fill="none" />
            {coords.map((c, i) => (
              <g key={i}>
                <circle
                  className="price-history__hit"
                  cx={c.x}
                  cy={c.y}
                  r={9}
                  fill="transparent"
                  onClick={() => setActiveIndex((cur) => (cur === i ? null : i))}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex((cur) => (cur === i ? null : cur))}
                />
                <circle
                  className={`price-history__dot ${activeIndex === i ? 'price-history__dot--active' : ''}`}
                  cx={c.x}
                  cy={c.y}
                  r={activeIndex === i ? 5 : 3}
                />
              </g>
            ))}
          </svg>
          {active && (
            <div
              className="price-history__tooltip"
              style={{
                left: `${(active.x / WIDTH) * 100}%`,
                top: `${(active.y / HEIGHT) * 100}%`,
                transform: `translate(${active.x < WIDTH / 2 ? '4px' : 'calc(-100% - 4px)'}, -50%)`,
              }}
            >
              <strong>{formatPrice(active.price)}</strong>
              <span>{formatPointDate(active.recordedAt, true)}</span>
            </div>
          )}
        </div>
        <span className="price-history__gridlabel">{formatPrice(min)}</span>
      </div>
      <div className="price-history__axis">
        {coords.map((c, i) => {
          if (!tickIndices.includes(i)) return null;
          const align = i === 0 ? 'left' : i === coords.length - 1 ? 'right' : 'center';
          return (
            <span
              key={i}
              className={`price-history__tick price-history__tick--${align}`}
              style={{ left: `${(c.x / WIDTH) * 100}%` }}
            >
              {formatPointDate(c.recordedAt)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
