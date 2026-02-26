import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { KlineCandle, TradeAnalysisPayload } from "../../types/ranging-dashboard";

interface TradeAnalysisChartProps {
  analysis: TradeAnalysisPayload;
}

const chartHeight = 420;

function toTimestamp(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function findClosestCandle(klines: KlineCandle[], entryTimeMs: number): KlineCandle | undefined {
  if (klines.length === 0) return undefined;

  let closest = klines[0];
  let closestDistance = Math.abs((closest?.time ?? 0) - entryTimeMs);

  for (let index = 1; index < klines.length; index += 1) {
    const candle = klines[index];
    if (!candle) continue;

    const distance = Math.abs(candle.time - entryTimeMs);
    if (distance < closestDistance) {
      closest = candle;
      closestDistance = distance;
    }
  }

  return closest;
}

export function TradeAnalysisChart({ analysis }: TradeAnalysisChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candles = useMemo(
    () => [...analysis.klines].sort((a, b) => a.time - b.time),
    [analysis.klines],
  );
  const candleCount = candles.length;

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
    });

    const data: CandlestickData[] = candles.map((candle) => ({
      time: toTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    candleSeries.setData(data);

    const rangeLevels: Array<{
      label: string;
      value?: number;
      color: string;
      lineWidth: 1 | 2 | 3 | 4;
      lineStyle: LineStyle;
    }> = [
      {
        label: "VAL",
        value: analysis.run.rangeVal,
        color: "rgba(34,197,94,0.86)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
      },
      {
        label: "POC",
        value: analysis.run.rangePoc,
        color: "rgba(14,165,233,0.95)",
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
      },
      {
        label: "VAH",
        value: analysis.run.rangeVah,
        color: "rgba(245,158,11,0.9)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
      },
    ];

    for (const level of rangeLevels) {
      if (typeof level.value !== "number") continue;

      candleSeries.createPriceLine({
        price: level.value,
        color: level.color,
        lineWidth: level.lineWidth,
        lineStyle: level.lineStyle,
        axisLabelVisible: true,
        title: level.label,
      });
    }

    const entryPrice = analysis.trade.price ?? analysis.run.price;
    if (typeof entryPrice === "number") {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: analysis.trade.side === "long" ? "rgba(34,197,94,0.9)" : "rgba(245,158,11,0.9)",
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "ENTRY",
      });
    }

    const entryCandle = findClosestCandle(candles, analysis.trade.generatedAtMs);
    if (entryCandle) {
      createSeriesMarkers(candleSeries, [
        {
          time: toTimestamp(entryCandle.time),
          position: analysis.trade.side === "long" ? "belowBar" : "aboveBar",
          shape: analysis.trade.side === "long" ? "arrowUp" : "arrowDown",
          color: analysis.trade.side === "long" ? "#22c55e" : "#f59e0b",
          text: "ENTRY",
        },
      ]);
    }

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
  }, [analysis, candles]);

  if (candles.length === 0) {
    return (
      <div className="panel flex h-[460px] items-center justify-center">
        <p className="text-sm text-slate-400">No klines available for this trade context</p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Trade Candlestick Context</h3>
          <p className="text-xs text-slate-400">
            {analysis.timeframe} candles | {analysis.barsBefore} bars before / {analysis.barsAfter} bars after
          </p>
        </div>
        <p className="text-xs text-slate-400">{candleCount} candles</p>
      </div>
      <div ref={containerRef} className="h-[420px] w-full" />
    </div>
  );
}
