"use client";

import { createChart, CrosshairMode, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Bar, Signal } from "@/lib/types";

export function MarketChart({ bars, signal }: { bars: Bar[]; signal?: Signal | null }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || !bars.length) return;
    const chart = createChart(element, {
      width: element.clientWidth,
      height: 330,
      layout: { background: { color: "transparent" }, textColor: "#8290a8", fontFamily: "Inter, sans-serif" },
      localization: {
        timeFormatter: (time: Time) => new Date(Number(time) * 1000).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        }),
      },
      grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.055)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,.08)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => new Date(Number(time) * 1000).toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit",
        }),
      },
    });
    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#dc2626", borderUpColor: "#16a34a",
      borderDownColor: "#dc2626", wickUpColor: "#16a34a", wickDownColor: "#dc2626",
    });
    const candles = bars.map((bar) => ({
      time: (new Date(bar.datetime).getTime() / 1000) as UTCTimestamp,
      open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close),
    })).sort((a, b) => a.time - b.time);
    series.setData(candles);
    if (signal && signal.signal !== "HOLD") {
      series.setMarkers([{
        time: candles[candles.length - 1].time,
        position: signal.signal === "BUY" ? "belowBar" : "aboveBar",
        color: signal.signal === "BUY" ? "#16a34a" : "#dc2626",
        shape: signal.signal === "BUY" ? "arrowUp" : "arrowDown",
        text: `${signal.signal} ${(signal.confidence * 100).toFixed(0)}%`,
      }]);
    }
    chart.timeScale().fitContent();
    const resize = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth }));
    resize.observe(element);
    return () => { resize.disconnect(); chart.remove(); };
  }, [bars, signal]);

  return <div ref={host} className="market-chart" role="img" aria-label="Interactive five-minute candlestick chart" />;
}
