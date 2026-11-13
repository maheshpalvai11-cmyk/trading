"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, RefreshCw, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState, PageTitle, Panel, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

const CLASS_NAMES = ["SELL", "HOLD", "BUY"];
const COLORS = ["#dc6262", "#e7ae4b", "#37c76f"];

export default function PerformancePage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [data, setData] = useState<any>(null);
  const [importance, setImportance] = useState<{ feature: string; importance: number }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [metrics, explanation] = await Promise.all([api.metrics(symbol), api.explain(symbol)]);
      setData(metrics); setImportance(explanation.features);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Model evaluation failed"); }
    finally { setLoading(false); }
  }, [symbol]);
  useEffect(() => { void load(); }, [load]);
  async function train() {
    setTraining(true);
    try {
      const job = await api.train(symbol);
      setError("");
      const socket = new WebSocket(`${process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") || "ws://localhost:8000"}/ws/training/${job.job_id}`);
      socket.onmessage = async (event) => {
        const status = JSON.parse(event.data);
        if (status.status === "completed") { socket.close(); await load(); setTraining(false); }
        if (status.status === "failed") { socket.close(); setError(status.message); setTraining(false); }
      };
      socket.onerror = () => { socket.close(); setError("Could not follow training progress. Refresh the metrics shortly."); setTraining(false); };
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Training request failed"); setTraining(false); }
  }
  const matrix = data?.confusion_matrix || [];
  const comparisons = data ? Object.entries(data.comparison) as [string, any][] : [];
  const roc = data ? [-1, 0, 1].map((label) => {
    const classes: number[] = data.probability_class_order;
    const labels: number[] = data.test_labels;
    const probabilities: number[][] = data.test_probabilities;
    const probabilityIndex = classes.indexOf(label);
    const thresholds = Array.from({ length: 51 }, (_, index) => 1 - index / 50);
    const actualPositive = labels.map((value) => value === label);
    const positives = actualPositive.filter(Boolean).length;
    const negatives = actualPositive.length - positives;
    const points = thresholds.map((threshold) => {
      const predicted = labels.map((_, index) =>
        probabilityIndex >= 0 && probabilities[index][probabilityIndex] >= threshold
      );
      const truePositive = actualPositive.filter((positive, index) => positive && predicted[index]).length;
      const falsePositive = actualPositive.filter((positive, index) => !positive && predicted[index]).length;
      return { fpr: negatives ? falsePositive / negatives : 0, tpr: positives ? truePositive / positives : 0 };
    }).reverse();
    return { label, points };
  }) : [];
  const calibration = data ? (() => {
    const labels: number[] = data.test_labels;
    const classes: number[] = data.probability_class_order;
    const probabilities: number[][] = data.test_probabilities;
    return Array.from({ length: 10 }, (_, bin) => {
      const rows = probabilities.map((row, index) => {
        const confidence = Math.max(...row);
        const predicted = classes[row.indexOf(confidence)];
        return { confidence, correct: predicted === labels[index] ? 1 : 0 };
      }).filter((row) => row.confidence >= bin / 10 && (row.confidence < (bin + 1) / 10 || bin === 9));
      return { confidence: rows.length ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length : (bin + 0.5) / 10,
        accuracy: rows.length ? rows.reduce((sum, row) => sum + row.correct, 0) / rows.length : null,
        ideal: (bin + 0.5) / 10, count: rows.length };
    }).filter((row) => row.accuracy !== null);
  })() : [];

  return <div className="page-stack">
    <PageTitle eyebrow="MODEL EVALUATION" title="Performance & reliability" description="Chronological holdout results, class-level errors and model drivers. No shuffled validation." action={<><select className="top-select" value={symbol} onChange={(event) => setSymbol(event.target.value)}>{["RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN"].map((item) => <option key={item}>{item}</option>)}</select><button className="button button-outline" onClick={() => void train()} disabled={training}>{training ? <span className="button-spinner" /> : <BrainCircuit size={15} />}{training ? "Training…" : "Train model"}</button></>} />
    {error && <ErrorState error={error} retry={() => void load()} />}
    {loading && !data ? <Panel><Skeleton rows={8} /></Panel> : data && <>
      <div className="stats-grid four">
        <div className="performance-card selected-model"><div className="eyebrow"><Trophy size={13} /> SELECTED MODEL</div><strong>{data.selected_model}</strong><small>Chosen by validation macro-F1</small></div>
        <div className="performance-card"><span>Test accuracy</span><strong>{(data.metrics.accuracy * 100).toFixed(1)}%</strong><small>Chronological final 20%</small></div>
        <div className="performance-card"><span>Macro precision</span><strong>{(data.metrics.precision * 100).toFixed(1)}%</strong><small>Equal weight per class</small></div>
        <div className="performance-card"><span>Macro F1</span><strong>{(data.metrics.f1 * 100).toFixed(1)}%</strong><small>{data.model_rows.toLocaleString()} usable rows</small></div>
      </div>
      <div className="performance-grid">
        <Panel><div className="panel-heading"><div><div className="eyebrow">ERROR ANALYSIS</div><h2>Confusion matrix</h2></div><span className="chart-unit">Actual → · Predicted ↓</span></div>
          <div className="matrix-wrap"><div className="matrix-axis"><span></span><span>SELL</span><span>HOLD</span><span>BUY</span></div>{matrix.map((row: number[], rowIndex: number) => <div className="matrix-row" key={rowIndex}><b>{CLASS_NAMES[rowIndex]}</b>{row.map((value, colIndex) => { const max = Math.max(1, ...matrix.flat()); return <div key={colIndex} className="matrix-cell" style={{ backgroundColor: `color-mix(in srgb, ${COLORS[rowIndex]} ${Math.max(8, value / max * 55)}%, transparent)` }}><strong>{value}</strong><small>{row.reduce((sum, item) => sum + item, 0) ? (value / row.reduce((sum, item) => sum + item, 0) * 100).toFixed(0) : 0}%</small></div>; })}</div>)}</div>
          <div className="chart-footnote"><span><i className="legend-red" />SELL</span><span><i className="legend-amber" />HOLD</span><span><i className="legend-green" />BUY</span><span>Holdout set: final chronological 20%</span></div>
        </Panel>
        <Panel><div className="panel-heading"><div><div className="eyebrow">MODEL COMPARISON</div><h2>Train · validation · test</h2></div></div>
          <div className="table-scroll"><table><thead><tr><th>MODEL</th><th>SPLIT</th><th>ACCURACY</th><th>PRECISION</th><th>F1</th></tr></thead><tbody>{comparisons.flatMap(([name, splits]) => ["train", "validation", "test"].map((split) => <tr key={`${name}-${split}`}><td>{name}</td><td className="table-time">{split}</td><td>{(splits[split].accuracy * 100).toFixed(1)}%</td><td>{(splits[split].precision * 100).toFixed(1)}%</td><td>{(splits[split].f1 * 100).toFixed(1)}%</td></tr>))}</tbody></table></div>
        </Panel>
      </div>
      <div className="performance-grid">
        <Panel><div className="panel-heading"><div><div className="eyebrow">ONE-VS-REST · TEST SET</div><h2>ROC curves</h2></div></div>
          <div className="responsive-chart"><ResponsiveContainer width="100%" height={235}><ScatterChart margin={{ top: 8, right: 12, left: -15, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.05)" /><XAxis type="number" dataKey="fpr" name="False positive rate" domain={[0, 1]} tick={{ fill: "#8290a8", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis type="number" dataKey="tpr" name="True positive rate" domain={[0, 1]} tick={{ fill: "#8290a8", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "#111b2c", border: "1px solid #29364a", borderRadius: 9, color: "#e5eaf2" }} /><ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#66758c" strokeDasharray="4 4" /><Scatter data={roc.find((curve) => curve.label === -1)?.points} name="SELL" dataKey="tpr" fill="#ef6262" line={{ stroke: "#ef6262", strokeWidth: 2 }} isAnimationActive={false} /><Scatter data={roc.find((curve) => curve.label === 0)?.points} name="HOLD" dataKey="tpr" fill="#e8b44e" line={{ stroke: "#e8b44e", strokeWidth: 2 }} isAnimationActive={false} /><Scatter data={roc.find((curve) => curve.label === 1)?.points} name="BUY" dataKey="tpr" fill="#2bc16e" line={{ stroke: "#2bc16e", strokeWidth: 2 }} isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div>
        </Panel>
        <Panel><div className="panel-heading"><div><div className="eyebrow">PREDICTED CONFIDENCE VS OUTCOME</div><h2>Calibration plot</h2></div></div>
          <div className="responsive-chart"><ResponsiveContainer width="100%" height={235}><LineChart data={calibration} margin={{ top: 8, right: 12, left: -15, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.05)" /><XAxis type="number" dataKey="confidence" domain={[0, 1]} tick={{ fill: "#8290a8", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis type="number" domain={[0, 1]} tick={{ fill: "#8290a8", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#111b2c", border: "1px solid #29364a", borderRadius: 9, color: "#e5eaf2" }} formatter={(value, name) => [Number(value).toFixed(2), name]} /><Line type="linear" dataKey="ideal" name="Perfect calibration" stroke="#66758c" strokeDasharray="4 4" dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="accuracy" name="Observed accuracy" stroke="#55d984" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
        </Panel>
      </div>
      <Panel><div className="panel-heading"><div><div className="eyebrow">EXPLAINABILITY · MODEL IMPORTANCE</div><h2>Most influential features</h2></div><span className="chart-unit">Relative importance</span></div>
        <div className="responsive-chart"><ResponsiveContainer width="100%" height={280}><BarChart data={importance} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}><CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} /><XAxis type="number" tick={{ fill: "#8290a8", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="feature" width={135} tick={{ fill: "#a9b5c8", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#111b2c", border: "1px solid #29364a", borderRadius: 9, color: "#e5eaf2" }} /><Bar dataKey="importance" radius={[0, 4, 4, 0]}><Cell fill="#39c973" />{importance.slice(1).map((_, index) => <Cell key={index} fill={index % 2 ? "#32a967" : "#268b58"} />)}</Bar></BarChart></ResponsiveContainer></div>
      </Panel>
      <div className="footnote-line">Training and test periods are ordered in time. Metrics reflect the offline demo data, not live-market performance.</div>
    </>}
  </div>;
}
