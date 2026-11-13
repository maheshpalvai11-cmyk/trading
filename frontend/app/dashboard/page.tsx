"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, RefreshCw, SlidersHorizontal } from "lucide-react";
import { MarketChart } from "@/components/market-chart";
import { ErrorState, PageTitle, Panel, SignalBadge, Skeleton, StatCard, formatINR } from "@/components/ui";
import { api } from "@/lib/api";
import type { Bar, Signal } from "@/lib/types";

const SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN"];

export default function DashboardPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [bars, setBars] = useState<Bar[]>([]);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [market, latest] = await Promise.all([api.bars(symbol), api.signals(symbol)]);
      setBars(market.bars); setSignal(latest.signals[0] || null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unexpected API error"); }
    finally { setLoading(false); }
  }, [symbol]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const delta = last && previous ? (last.close / previous.close - 1) * 100 : 0;
  const istClock = now ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now) : "--:--:--";
  const weekday = now ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now) : "";
  const hour = now ? Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now)) : 0;
  const minute = now ? Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", minute: "2-digit" }).format(now)) : 0;
  const marketOpen = weekday !== "Sat" && weekday !== "Sun" && (hour > 9 || (hour === 9 && minute >= 15)) && (hour < 15 || (hour === 15 && minute < 30));

  return <div className="page-stack">
    <PageTitle eyebrow="LIVE MARKET WORKSPACE" title="Dashboard" description="A clear read on the tape, the model and the risk around each idea." action={<button className="button button-outline" onClick={() => void reload()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>} />
    <div className="toolbar-row">
      <div className="symbol-picker"><SlidersHorizontal size={15} /><label htmlFor="symbol-select">INSTRUMENT</label><select id="symbol-select" value={symbol} onChange={(event) => setSymbol(event.target.value)}>{SYMBOLS.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="market-clock"><Clock3 size={15} /><span>{istClock} <small>IST</small></span><i className={`status-dot ${marketOpen ? "" : "muted"}`} />{marketOpen ? "SESSION OPEN" : "SESSION CLOSED"}</div>
    </div>
    {error && <ErrorState error={error} retry={() => void reload()} />}
    <div className="stats-grid four">
      <StatCard label="Last traded price" value={last ? formatINR(last.close) : "—"} change={last ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}% · latest bar` : "Waiting for data"} tone={delta >= 0 ? "positive" : "negative"} />
      <StatCard label="Model direction" value={signal?.signal || "—"} change={signal ? `${(signal.confidence * 100).toFixed(0)}% confidence` : "No signal yet"} tone={signal?.signal === "BUY" ? "positive" : signal?.signal === "SELL" ? "negative" : "neutral"} />
      <StatCard label="Risk per share" value={signal ? formatINR(signal.atr) : "—"} change="1 × ATR stop distance" />
      <StatCard label="Forecast window" value="15 min" change="3 bars ahead" />
    </div>
    <div className="dashboard-grid">
      <Panel className="chart-panel">
        <div className="panel-heading"><div><div className="eyebrow">PRICE ACTION · 5 MIN</div><h2>{symbol} <span className={delta >= 0 ? "text-green" : "text-red"}>{last ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%` : ""}</span></h2></div>
          <div className="chart-legend"><span><i className="legend-green" />Up bar</span><span><i className="legend-red" />Down bar</span></div></div>
        {loading && !bars.length ? <Skeleton rows={8} /> : bars.length ? <MarketChart bars={bars} signal={signal} /> : <div className="empty-chart">No candles available yet.</div>}
        {last && <div className="chart-footnote"><span>OHLCV demo feed</span><span>Latest bar {new Date(last.datetime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</span><span>{bars.length} bars loaded</span></div>}
      </Panel>
      <Panel className="signal-panel">
        <div className="panel-heading"><div><div className="eyebrow">MODEL OUTPUT</div><h2>Latest signal</h2></div><span className="live-tag"><i className="live-dot" />SIMULATED</span></div>
        {loading && !signal ? <Skeleton rows={6} /> : signal ? <>
          <div className={`signal-hero ${signal.signal.toLowerCase()}`}><SignalBadge signal={signal.signal} /><strong>{(signal.confidence * 100).toFixed(0)}<small>%</small></strong><span>confidence score</span><div className="confidence-track"><i style={{ width: `${signal.confidence * 100}%` }} /></div></div>
          <div className="signal-probs"><div><span>Buy</span><b className="text-green">{(signal.probabilities.buy * 100).toFixed(1)}%</b></div><div><span>Hold</span><b className="text-amber">{(signal.probabilities.hold * 100).toFixed(1)}%</b></div><div><span>Sell</span><b className="text-red">{(signal.probabilities.sell * 100).toFixed(1)}%</b></div></div>
          <div className="signal-levels"><div><span>Entry reference</span><b>{formatINR(signal.entry)}</b></div><div><span><ArrowDown size={13} /> Stop loss</span><b>{signal.stop_loss ? formatINR(signal.stop_loss) : "—"}</b></div><div><span><ArrowUp size={13} /> Target</span><b>{signal.target ? formatINR(signal.target) : "—"}</b></div></div>
          <div className="signal-disclaimer">ATR risk levels are illustrative. This system does not place orders.</div>
        </> : <div className="empty-chart">No signal available.</div>}
      </Panel>
    </div>
    <div className="footnote-line">Signal model: {signal?.source || "offline demo baseline"} <span>·</span> Decision time: {signal ? new Date(signal.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"} <span>·</span> Force square-off: 15:15 IST</div>
  </div>;
}
