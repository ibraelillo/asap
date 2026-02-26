import type { EquityPoint, TradeRecord } from "../../types/trade-results";
import { formatCurrency } from "../../lib/trade-results";

interface EquityChartProps {
  curve: EquityPoint[];
  trades: TradeRecord[];
}

const width = 1000;
const height = 320;
const paddingX = 46;
const paddingY = 28;

function toX(index: number, total: number): number {
  if (total <= 1) return width / 2;
  const innerWidth = width - paddingX * 2;
  return paddingX + (index / (total - 1)) * innerWidth;
}

function toY(value: number, minValue: number, maxValue: number): number {
  const safeRange = Math.max(1, maxValue - minValue);
  const ratio = (value - minValue) / safeRange;
  const innerHeight = height - paddingY * 2;
  return height - paddingY - ratio * innerHeight;
}

export function EquityChart({ curve, trades }: EquityChartProps) {
  if (curve.length === 0) {
    return (
      <div className="panel flex h-[360px] items-center justify-center">
        <p className="text-sm text-slate-400">No equity data yet</p>
      </div>
    );
  }

  const values = curve.map((point) => point.equity);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const points = curve.map((point, index) => ({
    x: toX(index, curve.length),
    y: toY(point.equity, minValue, maxValue),
  }));

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const endEquity = curve[curve.length - 1]?.equity ?? 0;
  const startEquity = curve[0]?.equity ?? 0;
  const trendUp = endEquity >= startEquity;

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Equity Curve</h3>
          <p className="text-xs text-slate-400">
            Trades plotted on close with PnL markers
          </p>
        </div>
        <p className={`text-sm font-medium ${trendUp ? "text-emerald-300" : "text-rose-300"}`}>
          {formatCurrency(endEquity - startEquity)}
        </p>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full">
        <defs>
          <linearGradient id="equity-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id="equity-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const y = toY(minValue + (maxValue - minValue) * r, minValue, maxValue);
          return (
            <line
              key={r}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="rgba(148,163,184,0.18)"
              strokeDasharray="4 8"
            />
          );
        })}

        <path d={`${path} L ${points[points.length - 1]?.x ?? 0} ${height - paddingY} L ${points[0]?.x ?? 0} ${height - paddingY} Z`} fill="url(#equity-area)" />
        <path d={path} fill="none" stroke="url(#equity-line)" strokeWidth="3" strokeLinecap="round" />

        {points.map((point, index) => {
          const trade = trades[index];
          if (!trade) return null;

          const color = trade.netPnl >= 0 ? "#34d399" : "#fb7185";
          return <circle key={trade.id} cx={point.x} cy={point.y} r="3.2" fill={color} opacity="0.95" />;
        })}

        <text x={paddingX} y={paddingY - 8} fill="rgba(226,232,240,0.8)" fontSize="11">
          {formatCurrency(maxValue)}
        </text>
        <text x={paddingX} y={height - 8} fill="rgba(148,163,184,0.8)" fontSize="11">
          {formatCurrency(minValue)}
        </text>
      </svg>
    </div>
  );
}
