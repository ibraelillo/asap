import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type LineData,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import type { BotRunRecord } from "../../types/ranging-dashboard";

interface SignalChartProps {
  runs: BotRunRecord[];
}

const chartHeight = 300;

function toTimestamp(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function markerForRun(run: BotRunRecord, value: number): SeriesMarker<UTCTimestamp> | null {
  if (run.runStatus === "failed") {
    return {
      time: toTimestamp(run.generatedAtMs),
      position: "aboveBar",
      shape: "circle",
      color: "#fb7185",
      text: "FAIL",
      price: value,
    };
  }

  if (run.signal === "long") {
    return {
      time: toTimestamp(run.generatedAtMs),
      position: "belowBar",
      shape: "arrowUp",
      color: "#34d399",
      text: "LONG",
      price: value,
    };
  }

  if (run.signal === "short") {
    return {
      time: toTimestamp(run.generatedAtMs),
      position: "aboveBar",
      shape: "arrowDown",
      color: "#f59e0b",
      text: "SHORT",
      price: value,
    };
  }

  return null;
}

export function SignalChart({ runs }: SignalChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (runs.length === 0) {
    return (
      <div className="panel flex h-[360px] items-center justify-center">
        <p className="text-sm text-slate-400">No analysis runs yet</p>
      </div>
    );
  }

  const sorted = useMemo(
    () => [...runs].sort((a, b) => a.generatedAtMs - b.generatedAtMs),
    [runs],
  );

  const values = useMemo(() => {
    let previous = sorted[0]?.price ?? 0;
    return sorted.map((run) => {
      if (typeof run.price === "number" && Number.isFinite(run.price)) {
        previous = run.price;
      }
      return previous;
    });
  }, [sorted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (sorted.length === 0) return;

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

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#22d3ee",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const lineData: LineData[] = sorted.map((run, index) => ({
      time: toTimestamp(run.generatedAtMs),
      value: values[index] ?? 0,
    }));
    lineSeries.setData(lineData);

    const markers: SeriesMarker<UTCTimestamp>[] = sorted
      .map((run, index) => markerForRun(run, values[index] ?? 0))
      .filter((marker): marker is SeriesMarker<UTCTimestamp> => marker !== null);
    createSeriesMarkers(lineSeries, markers);

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
  }, [sorted, values]);

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Price + Signal Timeline</h3>
          <p className="text-xs text-slate-400">Latest runs with long/short markers</p>
        </div>
        <p className="text-xs text-slate-400">{sorted.length} points</p>
      </div>
      <div ref={containerRef} className="h-[300px] w-full" />
    </div>
  );
}
