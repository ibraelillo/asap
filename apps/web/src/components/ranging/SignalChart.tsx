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

function markerForRun(
  run: BotRunRecord,
  value: number,
  time: UTCTimestamp,
): SeriesMarker<UTCTimestamp> | null {
  if (run.runStatus === "failed") {
    return {
      time,
      position: "aboveBar",
      shape: "circle",
      color: "#fb7185",
      text: "FAIL",
      price: value,
    };
  }

  if (run.signal === "long") {
    return {
      time,
      position: "belowBar",
      shape: "arrowUp",
      color: "#34d399",
      text: "LONG",
      price: value,
    };
  }

  if (run.signal === "short") {
    return {
      time,
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

  const sorted = useMemo(
    () => [...runs].sort((a, b) => a.generatedAtMs - b.generatedAtMs),
    [runs],
  );

  const prepared = useMemo(() => {
    let previousValue = sorted[0]?.price ?? 0;
    let previousTimeSec = Number.NEGATIVE_INFINITY;

    return sorted.map((run) => {
      if (typeof run.price === "number" && Number.isFinite(run.price)) {
        previousValue = run.price;
      }

      let currentTimeSec = run.generatedAtMs / 1000;
      if (currentTimeSec <= previousTimeSec) {
        // lightweight-charts requires strictly ascending timestamps.
        currentTimeSec = previousTimeSec + 0.001;
      }
      previousTimeSec = currentTimeSec;

      return {
        run,
        value: previousValue,
        time: currentTimeSec as UTCTimestamp,
      };
    });
  }, [sorted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prepared.length === 0) return;

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

    const lineData: LineData[] = prepared.map((point) => ({
      time: point.time,
      value: point.value,
    }));
    lineSeries.setData(lineData);

    const markers: SeriesMarker<UTCTimestamp>[] = prepared
      .map((point) => markerForRun(point.run, point.value, point.time))
      .filter(
        (marker): marker is SeriesMarker<UTCTimestamp> => marker !== null,
      );
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
  }, [prepared]);

  if (sorted.length === 0) {
    return (
      <div className="panel flex h-[360px] items-center justify-center">
        <p className="text-sm text-slate-400">No analysis runs yet</p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            Price + Signal Timeline
          </h3>
          <p className="text-xs text-slate-400">
            Latest runs with long/short markers
          </p>
        </div>
        <p className="text-xs text-slate-400">{sorted.length} points</p>
      </div>
      <div ref={containerRef} className="h-[300px] w-full" />
    </div>
  );
}
