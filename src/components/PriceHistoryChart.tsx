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
const PADDING = 6;

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = PADDING + (i / (points.length - 1)) * (WIDTH - PADDING * 2);
    const y = HEIGHT - PADDING - ((p.price - min) / span) * (HEIGHT - PADDING * 2);
    return { x, y };
  });
  const last = coords[coords.length - 1];

  return (
    <div className="price-history">
      <p className="price-history__label">Історія ціни</p>
      <svg
        className="price-history__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Ціна від ${formatPrice(points[0].price)} до ${formatPrice(points[points.length - 1].price)}`}
      >
        <polyline
          className="price-history__line"
          fill="none"
          points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
        />
        <circle className="price-history__dot" cx={last.x} cy={last.y} r={3} />
      </svg>
      <div className="price-history__range">
        <span>{formatPrice(min)}</span>
        {max !== min && <span>{formatPrice(max)}</span>}
      </div>
    </div>
  );
}
