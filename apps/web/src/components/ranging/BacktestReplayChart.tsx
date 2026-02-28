import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import type { BacktestDetailsPayload, KlineCandle } from "../../types/ranging-dashboard";

interface BacktestReplayChartProps {
  details: BacktestDetailsPayload;
}

const chartHeight = 460;

function toTimestamp(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function findClosestCandleTime(candles: KlineCandle[], targetMs: number): number | undefined {
  if (candles.length === 0) return undefined;

  let closest = candles[0];
  let closestDistance = Math.abs((closest?.time ?? 0) - targetMs);

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (!candle) continue;

    const distance = Math.abs(candle.time - targetMs);
    if (distance < closestDistance) {
      closest = candle;
      closestDistance = distance;
    }
  }

  return closest?.time;
}

function markerForReason(reason: string): {
  color: string;
  shape: "circle" | "arrowUp" | "arrowDown" | "square";
} {
  switch (reason) {
    case "tp1":
      return { color: "#22c55e", shape: "circle" };
    case "tp2":
      return { color: "#16a34a", shape: "square" };
    case "stop":
      return { color: "#ef4444", shape: "circle" };
    case "signal":
      return { color: "#f59e0b", shape: "square" };
    default:
      return { color: "#94a3b8", shape: "circle" };
  }
}

function buildSegmentPoints(
  fromMs: number,
  toMs: number,
  value: number,
): Array<{ time: UTCTimestamp; value: number }> {
  const startMs = Math.min(fromMs, toMs);
  const endMs = Math.max(fromMs, toMs);
  const startTime = toTimestamp(startMs);
  const endTime = toTimestamp(endMs);

  if (startTime === endTime) {
    return [{ time: startTime, value }];
  }

  return [
    { time: startTime, value },
    { time: endTime, value },
  ];
}

export function BacktestReplayChart({ details }: BacktestReplayChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candles = useMemo(
    () => [...details.candles].sort((a, b) => a.time - b.time),
    [details.candles],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (candles.length === 0) return;

    const chart = createChart(container, {
      width: Math.max(280, Math.floor(container.clientWidth)),
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(226,232,240,0.82)",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.14)" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      leftPriceScale: {
        visible: false,
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: "right",
    });

    const candleData: CandlestickData[] = candles.map((candle) => ({
      time: toTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    candleSeries.setData(candleData);

    const markers: SeriesMarker<UTCTimestamp>[] = [];

    for (const trade of details.trades) {
      const entryTime = findClosestCandleTime(candles, trade.entryTime);
      if (entryTime) {
        markers.push({
          time: toTimestamp(entryTime),
          position: trade.side === "long" ? "belowBar" : "aboveBar",
          shape: trade.side === "long" ? "arrowUp" : "arrowDown",
          color: trade.side === "long" ? "#22c55e" : "#f59e0b",
          text: `E${trade.id}`,
        });
      }

      const closeTime = findClosestCandleTime(candles, trade.closeTime);
      if (entryTime && closeTime && trade.rangeLevels) {
        const levelDefs = [
          {
            value: trade.rangeLevels.val,
            color: "rgba(34,197,94,0.55)",
            lineStyle: LineStyle.Dashed,
          },
          {
            value: trade.rangeLevels.poc,
            color: "rgba(14,165,233,0.7)",
            lineStyle: LineStyle.Solid,
          },
          {
            value: trade.rangeLevels.vah,
            color: "rgba(245,158,11,0.55)",
            lineStyle: LineStyle.Dashed,
          },
        ];

        for (const level of levelDefs) {
          const segmentSeries = chart.addSeries(LineSeries, {
            color: level.color,
            lineWidth: 1,
            lineStyle: level.lineStyle,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            priceScaleId: "right",
          });

          segmentSeries.setData(
            buildSegmentPoints(entryTime, closeTime, level.value),
          );
        }
      }

      for (const exit of trade.exits) {
        const exitTime = findClosestCandleTime(candles, exit.time);
        if (!exitTime) continue;

        const style = markerForReason(exit.reason);
        markers.push({
          time: toTimestamp(exitTime),
          position: trade.side === "long" ? "aboveBar" : "belowBar",
          shape: style.shape,
          color: style.color,
          text: `${trade.id}:${exit.reason.toUpperCase()}`,
        });
      }
    }

    createSeriesMarkers(candleSeries, markers);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({
        width: Math.max(280, Math.floor(container.clientWidth)),
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, details.trades]);

  if (candles.length === 0) {
    return (
      <div className="panel flex h-[500px] items-center justify-center">
        <p className="text-sm text-slate-400">No candles available for this backtest window</p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Backtest Replay</h3>
          <p className="text-xs text-slate-400">
            {details.chartTimeframe} candles with entries/exits and range context
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Trade range levels: VAL (green dashed), POC (blue), VAH (amber dashed)
          </p>
        </div>
        <p className="text-xs text-slate-400">{candles.length} candles</p>
      </div>
      <div ref={containerRef} className="h-[460px] w-full" />
    </div>
  );
}
