import { useState } from 'react';
import type { MouseEvent, TouchEvent } from 'react';
import { formatPrice } from '../utils/format';

interface PricePoint {
  price: number;
  recordedAt: string | null;
}

interface PriceHistoryChartProps {
  points: PricePoint[];
  currency?: 'USD' | 'UAH';
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
// Give the highest/lowest price some breathing room from the top/bottom edges
// instead of the extreme dots sitting flush on the gridlines.
const VALUE_PAD_RATIO = 0.18;

function formatPointDate(recordedAt: string | null, withYear = false): string {
  if (!recordedAt) return 'було';
  return new Date(recordedAt).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

// Picking ticks by even index spacing (the old approach) ignores that `xs`
// (real pixel positions) are time-proportional, not index-proportional —
// with uneven gaps between recorded dates, two index-evenly-spaced ticks can
// land close together in x and their date labels overlap. Pick by actual
// position instead, enforcing a minimum pixel gap, and drop a candidate
// tick rather than let it collide.
const MIN_TICK_GAP = 46;

function pickTickIndices(xs: number[]): number[] {
  const last = xs.length - 1;
  if (last <= 0) return [0];

  const indices = [0];
  let lastX = xs[0];
  for (const frac of [1 / 3, 2 / 3]) {
    if (indices.length >= 3) break;
    const targetX = xs[0] + frac * (xs[last] - xs[0]);
    let best = -1;
    let bestDist = Infinity;
    for (let i = 1; i < last; i++) {
      if (indices.includes(i)) continue;
      if (xs[i] - lastX < MIN_TICK_GAP || xs[last] - xs[i] < MIN_TICK_GAP) continue;
      const dist = Math.abs(xs[i] - targetX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best !== -1) {
      indices.push(best);
      lastX = xs[best];
    }
  }
  if (xs[last] - lastX >= MIN_TICK_GAP || indices.length === 1) indices.push(last);
  return indices;
}

export function PriceHistoryChart({ points, currency }: PriceHistoryChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const valuePad = span * VALUE_PAD_RATIO;
  const scaleMin = min - valuePad;
  const scaleSpan = span + valuePad * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = WIDTH - PAD_X * 2;
  const isPair = points.length === 2;

  const yFor = (price: number) => PAD_TOP + plotHeight - ((price - scaleMin) / scaleSpan) * plotHeight;

  // `x` positions are spaced evenly by index, not by real elapsed time.
  // Real-time spacing made a silent month collapse into one long flat line
  // and then cram same-day price changes into a tight cluster that read as
  // an hourly chart — even spacing shows the sequence of changes without
  // exaggerating (or hiding) the real gaps between them. Dates in the
  // tooltip/axis labels still come from the real `recordedAt`.
  const coords = points.map((p, i) => {
    let x: number;
    if (isPair) {
      x = i === 0 ? PAD_X : PAD_X + TWO_POINT_GAP;
    } else {
      const xFrac = i / (points.length - 1);
      x = PAD_X + xFrac * plotWidth;
    }
    return { ...p, x, y: yFor(p.price) };
  });

  // The dot marker sits in the middle of the flat band it represents (from
  // its own transition to the next one) instead of at the band's left edge —
  // the last point has no following band, so it stays at its true position.
  const markerX = coords.map((c, i) => (i === coords.length - 1 ? c.x : (c.x + coords[i + 1].x) / 2));

  // Step-after path: price holds at its value until the moment it changes.
  let stepPath = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    stepPath += ` L ${coords[i].x} ${coords[i - 1].y} L ${coords[i].x} ${coords[i].y}`;
  }

  const maxY = yFor(max);
  const minY = yFor(min);
  const tickIndices = pickTickIndices(markerX);
  const active = activeIndex !== null ? coords[activeIndex] : null;

  function bandIndexForX(svgX: number): number {
    if (svgX <= coords[0].x) return 0;
    for (let i = 0; i < coords.length - 1; i++) {
      if (svgX < coords[i + 1].x) return i;
    }
    return coords.length - 1;
  }

  function handlePointer(event: MouseEvent<SVGSVGElement> | TouchEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
    if (clientX == null) return;
    const svgX = ((clientX - rect.left) / rect.width) * WIDTH;
    setActiveIndex(bandIndexForX(svgX));
  }

  return (
    <div className="price-history">
      <p className="price-history__label">Історія ціни</p>
      <div className="price-history__chart-wrap">
        <span className="price-history__gridlabel">{formatPrice(max, currency)}</span>
        <div className="price-history__plot" style={{ height: HEIGHT }}>
          <svg
            className="price-history__chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            onMouseMove={handlePointer}
            onMouseLeave={() => setActiveIndex(null)}
            onTouchStart={handlePointer}
            onTouchMove={handlePointer}
          >
            <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" />
            <line className="price-history__gridline" x1={0} y1={maxY} x2={WIDTH} y2={maxY} />
            <line className="price-history__gridline" x1={0} y1={minY} x2={WIDTH} y2={minY} />
            <path className="price-history__line" d={stepPath} fill="none" />
          </svg>
          {/* Rendered as HTML, not SVG <circle>, because the chart stretches
              the viewBox non-uniformly (preserveAspectRatio="none") to fill
              its responsive width — an SVG circle would stretch into an
              ellipse along with it. */}
          {coords.map((c, i) => (
            <span
              key={i}
              className={`price-history__dot ${activeIndex === i ? 'price-history__dot--active' : ''}`}
              style={{ left: `${(markerX[i] / WIDTH) * 100}%`, top: `${(c.y / HEIGHT) * 100}%` }}
            />
          ))}
          {active && (
            <div
              className="price-history__tooltip"
              style={{
                left: `${(markerX[activeIndex as number] / WIDTH) * 100}%`,
                top: `${(active.y / HEIGHT) * 100}%`,
                transform: `translate(${
                  markerX[activeIndex as number] < WIDTH / 2 ? '4px' : 'calc(-100% - 4px)'
                }, ${active.y < HEIGHT / 2 ? '8px' : 'calc(-100% - 8px)'})`,
              }}
            >
              <strong>{formatPrice(active.price, currency)}</strong>
              <span>{formatPointDate(active.recordedAt, true)}</span>
            </div>
          )}
        </div>
        <span className="price-history__gridlabel">{formatPrice(min, currency)}</span>
      </div>
      <div className="price-history__axis">
        {coords.map((c, i) => {
          if (!tickIndices.includes(i)) return null;
          const align = i === 0 ? 'left' : i === coords.length - 1 ? 'right' : 'center';
          return (
            <span
              key={i}
              className={`price-history__tick price-history__tick--${align}`}
              style={{ left: `${(markerX[i] / WIDTH) * 100}%` }}
            >
              {formatPointDate(c.recordedAt)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
