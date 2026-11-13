"use client";

import { useEffect, useState } from "react";
import { Download, History, Play, Settings2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState, PageTitle, Panel, Skeleton, StatCard, formatINR } from "@/components/ui";
import { api } from "@/lib/api";
import type { BacktestResult, SavedBacktest } from "@/lib/types";

export default function BacktestingPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [threshold, setThreshold] = useState(0.55);
  const [stopAtr, setStopAtr] = useState(1);
  const [targetAtr, setTargetAtr] = useState(1.5);
  const [capital, setCapital] = useState(100000);
  const [cost, setCost] = useState(8);
  const [dailyLoss, setDailyLoss] = useState(2);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [savedRuns, setSavedRuns] = useState<SavedBacktest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  async function loadHistory() {
    try { setSavedRuns((await api.backtests()).runs); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load saved runs"); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, []);
  async function run() {
    setLoading(true); setError("");
    try {
      setResult(await api.runBacktest({ symbol, threshold, stop_atr: stopAtr, target_atr: targetAtr, capital, cost_bps: cost, daily_loss_limit_pct: dailyLoss }));
      await loadHistory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Backtest failed"); }
    finally { setLoading(false); }
  }
  async function openSavedRun(runId: string) {
    setError("");
    setLoading(true);
    try {
      const saved = await api.backtest(runId);
      setResult(saved);
      setSymbol(saved.symbol);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load saved run"); }
    finally { setLoading(false); }
  }
  function exportCsv() {
    if (!result) return;
    const columns = ["entry_time", "exit_time", "side", "entry", "exit", "pnl", "return_pct", "result"];
    const content = [columns.join(","), ...result.trades.map((trade) => columns.map((key) => JSON.stringify(trade[key as keyof typeof trade] ?? "")).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `signalforge-${result.symbol}-${result.id.slice(0, 8)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const metrics = result?.metrics;

  return <div className="page-stack">
    <PageTitle eyebrow="HISTORICAL SIMULATION" title="Backtesting" description="Explore how a simple intraday strategy behaves after costs. Historical simulation is not a forecast." action={result ? <button className="button button-outline" onClick={exportCsv}><Download size={15} /> Export trades</button> : undefined} />
    <div className="backtest-layout">
      <Panel className="parameter-panel">
        <div className="panel-heading"><div><div className="eyebrow">RISK & EXECUTION</div><h2>Simulation setup</h2></div><Settings2 size={17} className="muted-icon" /></div>
        <div className="form-grid">
          <label className="form-field full"><span>Instrument</span><select value={symbol} onChange={(event) => setSymbol(event.target.value)}>{["RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="form-field"><span>Signal threshold (τ)</span><input type="number" min=".34" max=".95" step=".01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
          <label className="form-field"><span>Stop loss · ATR ×</span><input type="number" min=".1" max="10" step=".1" value={stopAtr} onChange={(event) => setStopAtr(Number(event.target.value))} /></label>
          <label className="form-field"><span>Target · ATR ×</span><input type="number" min=".1" max="20" step=".1" value={targetAtr} onChange={(event) => setTargetAtr(Number(event.target.value))} /></label>
          <label className="form-field"><span>Capital (₹)</span><input type="number" min="1000" step="1000" value={capital} onChange={(event) => setCapital(Number(event.target.value))} /></label>
          <label className="form-field full"><span>Round-trip costs <small>basis points per side</small></span><input type="number" min="0" max="500" step="1" value={cost} onChange={(event) => setCost(Number(event.target.value))} /></label>
          <label className="form-field full"><span>Daily loss limit <small>% of session equity</small></span><input type="number" min=".1" max="20" step=".1" value={dailyLoss} onChange={(event) => setDailyLoss(Number(event.target.value))} /></label>
        </div>
        <button className="button button-primary run-button" disabled={loading} onClick={() => void run()}>{loading ? <span className="button-spinner" /> : <Play size={15} fill="currentColor" />}{loading ? "Running simulation…" : "Run backtest"}</button>
        <div className="form-footnote">5-minute bars · 3-bar max holding · forced session exit · cost-adjusted returns</div>
        <div className="saved-runs">
          <div className="saved-runs-heading"><span><History size={13} /> SAVED RUNS</span><button className="button-icon" onClick={() => void loadHistory()} aria-label="Refresh saved runs">↻</button></div>
          {historyLoading ? <Skeleton rows={2} /> : savedRuns.length ? savedRuns.map((run) => <button key={run.id} className={`saved-run ${result?.id === run.id ? "active" : ""}`} onClick={() => void openSavedRun(run.id)}><span><b>{run.symbol}</b><small>{new Date(run.created_at).toLocaleString("en-IN")}</small></span><strong className={run.metrics.total_return_pct >= 0 ? "text-green" : "text-red"}>{run.metrics.total_return_pct.toFixed(2)}%</strong></button>) : <div className="saved-runs-empty">Your saved simulations will appear here.</div>}
        </div>
      </Panel>
      <div className="results-column">
        {error && <ErrorState error={error} retry={() => void run()} />}
        {loading && !result ? <Panel><Skeleton rows={6} /></Panel> : result && metrics ? <>
          <div className="stats-grid three">
            <StatCard label="Total return" value={`${metrics.total_return_pct >= 0 ? "+" : ""}${metrics.total_return_pct}%`} change={`${metrics.trade_count} completed trades`} tone={metrics.total_return_pct >= 0 ? "positive" : "negative"} />
            <StatCard label="Sharpe ratio" value={metrics.sharpe.toFixed(2)} change="Annualized · intraday bars" />
            <StatCard label="Max drawdown" value={`${metrics.max_drawdown_pct.toFixed(2)}%`} change="Peak to trough" tone="negative" />
            <StatCard label="Win rate" value={`${metrics.win_rate_pct.toFixed(1)}%`} change="Winning closed trades" tone="positive" />
            <StatCard label="Profit factor" value={metrics.profit_factor.toFixed(2)} change="Gross wins / gross losses" />
            <StatCard label="Ending equity" value={formatINR(metrics.final_equity)} change={`Start ${formatINR(capital)}`} />
          </div>
          <Panel className="chart-panel">
            <div className="panel-heading"><div><div className="eyebrow">PORTFOLIO PATH</div><h2>Equity curve</h2></div><span className="chart-unit">₹ INR</span></div>
            <div className="responsive-chart"><ResponsiveContainer width="100%" height={270}><LineChart data={result.equity_curve} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="datetime" tickFormatter={(value) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })} tick={{ fill: "#8290a8", fontSize: 10 }} minTickGap={45} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} tick={{ fill: "#8290a8", fontSize: 10 }} axisLine={false} tickLine={false} width={55} domain={["auto", "auto"]} /><Tooltip contentStyle={{ background: "#111b2c", border: "1px solid #29364a", borderRadius: 9, color: "#e5eaf2" }} labelFormatter={(value) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} formatter={(value) => [formatINR(Number(value)), "Equity"]} /><Line type="monotone" dataKey="equity" stroke="#37c76f" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>
          </Panel>
          <Panel className="chart-panel">
            <div className="panel-heading"><div><div className="eyebrow">PEAK-TO-TROUGH RISK</div><h2>Drawdown</h2></div><span className="chart-unit">%</span></div>
            <div className="responsive-chart"><ResponsiveContainer width="100%" height={200}><AreaChart data={result.equity_curve} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="datetime" tickFormatter={(value) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })} tick={{ fill: "#8290a8", fontSize: 10 }} minTickGap={45} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `${Number(value).toFixed(1)}%`} tick={{ fill: "#8290a8", fontSize: 10 }} axisLine={false} tickLine={false} width={48} /><Tooltip contentStyle={{ background: "#111b2c", border: "1px solid #29364a", borderRadius: 9, color: "#e5eaf2" }} labelFormatter={(value) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} formatter={(value) => [`${Number(value).toFixed(2)}%`, "Drawdown"]} /><Area type="monotone" dataKey="drawdown" stroke="#ef6262" fill="rgba(239,98,98,.12)" strokeWidth={1.5} dot={false} /></AreaChart></ResponsiveContainer></div>
          </Panel>
          <Panel className="table-panel">
            <div className="panel-heading"><div><div className="eyebrow">EXECUTION LOG</div><h2>Closed trades <span className="count-pill">{result.trades.length}</span></h2></div></div>
            {result.trades.length ? <div className="table-scroll"><table><thead><tr><th>ENTRY</th><th>EXIT</th><th>SIDE</th><th>ENTRY PRICE</th><th>EXIT PRICE</th><th>P&amp;L</th><th>RESULT</th></tr></thead><tbody>{result.trades.slice(0, 100).map((trade, index) => <tr key={`${trade.entry_time}-${index}`}><td>{new Date(trade.entry_time).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>{new Date(trade.exit_time).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td><span className={`side-text ${trade.side.toLowerCase()}`}>{trade.side}</span></td><td>{formatINR(trade.entry)}</td><td>{formatINR(trade.exit)}</td><td className={trade.pnl >= 0 ? "text-green" : "text-red"}>{formatINR(trade.pnl)}</td><td><span className={`result-pill ${trade.result.toLowerCase()}`}>{trade.result}</span></td></tr>)}</tbody></table></div> : <div className="empty-chart">No trades crossed the selected signal threshold.</div>}
          </Panel>
        </> : <Panel className="empty-result"><div className="empty-icon"><Play size={19} /></div><h2>Your next backtest starts here</h2><p>Choose an instrument and risk settings, then run a cost-adjusted simulation on the local demo dataset.</p><div className="mini-kpis"><span>3-bar horizon</span><span>ATR exits</span><span>Intraday only</span></div></Panel>}
      </div>
    </div>
  </div>;
}
