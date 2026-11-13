"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CloudUpload, Database, RefreshCw } from "lucide-react";
import { ErrorState, PageTitle, Panel, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { Bar } from "@/lib/types";

const INDICATORS = ["close", "volume", "rsi_14", "macd", "atr_14", "bb_percent", "ema_21_spread", "vwap_deviation", "adx_14", "obv_change"];
const NUMBER_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export default function DataExplorerPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [bars, setBars] = useState<Bar[]>([]);
  const [selected, setSelected] = useState<string[]>(["close", "volume", "rsi_14", "atr_14"]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setBars((await api.bars(symbol, 120)).bars); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read dataset"); }
    finally { setLoading(false); }
  }, [symbol]);
  useEffect(() => { void load(); }, [load]);
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const result = await api.upload(symbol, file);
      setMessage(`Imported ${result.bars.toLocaleString()} cleaned bars for ${result.symbol}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "CSV upload failed"); }
    finally { setUploading(false); }
  }
  const columns = useMemo(() => ["datetime", ...selected], [selected]);
  const correlation = useMemo(() => {
    const names = selected.filter((item) => item !== "volume").slice(0, 6);
    const values: Record<string, (number | null)[]> = {};
    for (const name of names) {
      values[name] = bars.map((bar) => {
        const value = (bar as unknown as Record<string, unknown>)[name];
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      });
    }
    return names.map((row) => names.map((column) => {
      const pairs = values[row].map((left, index) => [left, values[column][index]] as const)
        .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null);
      if (row === column) return 1;
      if (pairs.length < 3) return 0;
      const meanX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
      const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
      const covariance = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) * (pair[1] - meanY), 0);
      const scaleX = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - meanX) ** 2, 0));
      const scaleY = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[1] - meanY) ** 2, 0));
      return scaleX && scaleY ? Math.max(-1, Math.min(1, covariance / (scaleX * scaleY))) : 0;
    }));
  }, [bars, selected]);
  function toggle(column: string) {
    setSelected((current) => current.includes(column) ? current.filter((entry) => entry !== column) : [...current, column]);
  }

  return <div className="page-stack">
    <PageTitle eyebrow="DATA QUALITY & FEATURES" title="Data explorer" description="Inspect cleaned intraday bars and technical features. Upload a CSV with datetime, open, high, low, close and volume columns." action={<select className="top-select" value={symbol} onChange={(event) => setSymbol(event.target.value)}>{["RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN"].map((item) => <option key={item}>{item}</option>)}</select>} />
    {error && <ErrorState error={error} retry={() => void load()} />}
    <div className="explorer-grid">
      <Panel className="upload-panel"><div className="upload-drop">
        <div className="upload-icon"><CloudUpload size={21} /></div><h2>Bring your own data</h2><p>CSV format · timestamps normalized to IST<br />Duplicates and invalid prices are removed.</p>
        <label className={`button button-outline ${uploading ? "disabled" : ""}`}><input type="file" accept=".csv,text/csv" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />{uploading ? <span className="button-spinner" /> : <CloudUpload size={15} />}{uploading ? "Importing…" : "Choose CSV"}</label>
        {message && <div className="success-message"><Check size={14} />{message}</div>}
      </div></Panel>
      <Panel><div className="dataset-summary"><div className="dataset-icon"><Database size={17} /></div><div><div className="eyebrow">ACTIVE DATASET</div><h2>{symbol} · 5-minute bars</h2><p>Offline seeded demo feed · Exchange session 09:15–15:30 IST</p></div><button className="button-icon" aria-label="Refresh data" onClick={() => void load()}><RefreshCw size={16} /></button></div><div className="dataset-stats"><div><span>Rows loaded</span><b>{loading ? "…" : bars.length}</b></div><div><span>First visible</span><b>{bars[0] ? new Date(bars[0].datetime).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</b></div><div><span>Last visible</span><b>{bars.at(-1) ? new Date(bars.at(-1)!.datetime).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</b></div></div></Panel>
    </div>
    <Panel><div className="panel-heading"><div><div className="eyebrow">FEATURE RELATIONSHIPS</div><h2>Rolling-window correlation <span className="chart-unit">Pearson · latest preview</span></h2></div></div>
      {correlation.length ? <div className="correlation-scroll"><div className="correlation-matrix"><div /><div className="correlation-labels">{selected.filter((item) => item !== "volume").slice(0, 6).map((name) => <span key={name}>{name.replaceAll("_", " ")}</span>)}</div>{correlation.map((row, rowIndex) => <div className="correlation-row" key={rowIndex}><b>{selected.filter((item) => item !== "volume").slice(0, 6)[rowIndex].replaceAll("_", " ")}</b>{row.map((value, colIndex) => <div key={colIndex} className="correlation-cell" title={`${value.toFixed(2)} correlation`} style={{ background: value >= 0 ? `rgba(43,193,110,${Math.abs(value) * .55})` : `rgba(239,98,98,${Math.abs(value) * .5})` }}>{value.toFixed(2)}</div>)}</div>)}</div></div> : <div className="empty-chart">Select at least one numeric indicator to build the correlation matrix.</div>}
      <div className="table-foot"><span>Green: positive · red: inverse</span><span>Correlations are descriptive, not causal.</span></div>
    </Panel>
    <Panel className="table-panel">
      <div className="panel-heading table-toolbar"><div><div className="eyebrow">FEATURE PREVIEW</div><h2>Latest bars <span className="count-pill">{bars.length}</span></h2></div>
        <div className="indicator-toggles" aria-label="Select visible columns">{INDICATORS.map((indicator) => <button key={indicator} className={selected.includes(indicator) ? "selected" : ""} onClick={() => toggle(indicator)} aria-pressed={selected.includes(indicator)}>{indicator.replaceAll("_", " ")}</button>)}</div>
      </div>
      {loading && !bars.length ? <Skeleton rows={7} /> : <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ").toUpperCase()}</th>)}</tr></thead><tbody>{bars.slice(-60).reverse().map((bar, index) => <tr key={`${bar.datetime}-${index}`}>{columns.map((column) => {
        const raw = column === "datetime" ? new Date(bar.datetime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : (bar as unknown as Record<string, unknown>)[column];
        return <td key={column} className={column === "datetime" ? "table-time" : ""}>{typeof raw === "number" ? NUMBER_FORMAT.format(raw) : raw == null ? "—" : String(raw)}</td>;
      })}</tr>)}</tbody></table></div>}
      <div className="table-foot"><span>Displaying most recent {Math.min(60, bars.length)} rows of the {Math.min(120, bars.length)}-bar preview</span><span>Features calculated from trailing observations only.</span></div>
    </Panel>
    <Panel className="quality-note"><div className="quality-icon"><Check size={16} /></div><div><strong>Chronological data handling</strong><p>Session filters, timestamp normalization, duplicate removal and trailing rolling indicators are applied before modeling. CSV import replaces the selected symbol in memory for this API process.</p></div></Panel>
  </div>;
}
