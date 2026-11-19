import { useEffect, useRef, useState } from 'react';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/** Bar with 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface BarDatum {
  key: string;
  label: string;
  tooltipTitle: string;
  value: number;
  detail?: string;
}

/** Single-series column chart (one hue, no legend — the card title names the series). */
export function BarChart({ data, format, ariaLabel, height = 240 }: { data: BarDatum[]; format: (n: number) => string; ariaLabel: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 60;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const step = data.length ? innerW / data.length : 0;
  const gap = Math.min(6, Math.max(2, step * 0.25));
  const barW = Math.max(1, step - gap);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 64))));
  const hovered = hover !== null ? data[hover] : undefined;
  const tipLeft = hover !== null ? Math.min(Math.max(padL + hover * step + step / 2, 90), Math.max(90, width - 90)) : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + innerH - t * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--color-line)" strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={padL - 10} y={y} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular">
                  {format(t * top)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / top) * innerH;
            const x = padL + i * step + gap / 2;
            return (
              <g key={d.key}>
                {h > 0 && <path d={barPath(x, padT + innerH - h, barW, h, 4)} fill={hover === i ? 'var(--color-forest-700)' : 'var(--color-forest-500)'} />}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
                    {d.label}
                  </text>
                )}
                <rect
                  x={padL + i * step}
                  y={padT}
                  width={step}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hovered && (
        <div className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-raised" style={{ left: tipLeft }}>
          <p className="font-medium text-ink">{hovered.tooltipTitle}</p>
          <p className="tabular mt-0.5 text-sm font-semibold text-ink">{format(hovered.value)}</p>
          {hovered.detail && <p className="text-muted">{hovered.detail}</p>}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with direct value labels. */
export function HBarList({ items, format }: { items: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">No data for this period yet.</p>;
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${format(item.value)}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">{item.label}</span>
            <span className="tabular shrink-0 font-medium text-ink">{format(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-cream-dark">
            <div className="h-2 rounded-full bg-forest-500" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </div>
          {item.sub && <p className="mt-1 text-xs text-muted">{item.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
