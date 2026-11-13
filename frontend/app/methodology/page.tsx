"use client";

import { useMemo } from "react";
import katex from "katex";
import { ArrowRight, BookOpenCheck, CircleAlert } from "lucide-react";
import { PageTitle, Panel } from "@/components/ui";

function Equation({ math, display = false }: { math: string; display?: boolean }) {
  const markup = useMemo(() => katex.renderToString(math, { displayMode: display, throwOnError: false, output: "html" }), [math, display]);
  return display
    ? <div className="equation display-equation" dangerouslySetInnerHTML={{ __html: markup }} />
    : <span className="equation" dangerouslySetInnerHTML={{ __html: markup }} />;
}

const stages = ["OHLCV bars", "Cleaning", "Feature engineering", "Forward labels", "Walk-forward models", "Probability signal", "ATR risk layer", "Costed backtest"];
const formulas = [
  ["Log return", String.raw`r_t = \ln\left(\frac{P_t}{P_{t-1}}\right)`],
  ["Forward return", String.raw`R_{t,h} = \ln\left(\frac{P_{t+h}}{P_t}\right)`],
  ["Volatility-aware label", String.raw`y_t = \begin{cases}+1 & R_{t,h} > c\,\sigma_t\\-1 & R_{t,h} < -c\,\sigma_t\\0 & \text{otherwise}\end{cases}`],
  ["Multiclass objective", String.raw`\mathcal{L} = -\frac{1}{N}\sum_t\sum_k \mathbb{1}[y_t=k]\log p_{t,k}`],
  ["Thresholded direction", String.raw`s_t = \begin{cases}+1 & p_{t,+1}>\tau\\-1 & p_{t,-1}>\tau\\0 & \text{otherwise}\end{cases}`],
  ["Net strategy return", String.raw`\rho_t = s_{t-1}r_t - c_{\mathrm{tc}}|s_t-s_{t-1}|`],
  ["Annualized Sharpe", String.raw`\mathrm{SR} = \frac{\operatorname{mean}(\rho)}{\operatorname{std}(\rho)}\sqrt{N_{\mathrm{bars/year}}}`],
  ["Maximum drawdown", String.raw`\mathrm{MDD} = \max_t \left(\frac{\max_{u\le t}E_u-E_t}{\max_{u\le t}E_u}\right)`],
  ["Equity curve", String.raw`E_T = E_0 \prod_{t=1}^{T}(1+\rho_t)`],
  ["Macro precision", String.raw`\mathrm{Precision} = \frac{1}{K}\sum_{k=1}^{K}\frac{TP_k}{TP_k+FP_k}`],
  ["Risk-constrained search", String.raw`\max_{\tau,k_1,k_2}\ \mathrm{SR}\qquad \mathrm{subject\ to}\quad \mathrm{MDD}\le 15\%`],
  ["ATR risk levels", String.raw`SL=P_t-s_t k_1 ATR_t,\qquad TP=P_t+s_t k_2 ATR_t`],
];

export default function MethodologyPage() {
  return <div className="page-stack">
    <PageTitle eyebrow="RESEARCH NOTES" title="Methodology" description="A reproducible, chronological research pipeline for 5-minute NSE equity bars and a 15-minute prediction horizon." />
    <Panel className="method-intro"><div className="method-intro-icon"><BookOpenCheck size={20} /></div><div><div className="eyebrow">THE QUESTION</div><h2>Can the next three bars offer an edge after risk and costs?</h2><p>SignalForge estimates the direction of the forward return distribution, holds no overnight positions, and treats each output as a research hypothesis — not an instruction to trade.</p></div></Panel>
    <Panel><div className="panel-heading"><div><div className="eyebrow">END-TO-END</div><h2>Data to evaluation</h2></div></div><div className="method-flow">{stages.map((stage, index) => <div key={stage} className="method-stage"><span>{String(index + 1).padStart(2, "0")}</span><b>{stage}</b>{index < stages.length - 1 && <ArrowRight size={14} />}</div>)}</div></Panel>
    <div className="method-two-col">
      <Panel><div className="eyebrow">MATHEMATICAL SETUP</div><h2>Labels, probabilities and risk</h2><p className="body-copy">Let <Equation math={String.raw`P_t`} /> denote the close at bar t. A rolling estimate of volatility sets a neutral band around the forward return; the label uses only the future price, while features use information available at decision time.</p>
        <div className="equation-list">{formulas.map(([label, expression]) => <div className="equation-row" key={label}><span>{label}</span><Equation math={expression} display /></div>)}</div>
      </Panel>
      <div className="method-side-stack">
        <Panel><div className="eyebrow">DATA & VALIDATION</div><h2>Keep time in order</h2><ul className="check-list"><li>Normalize bar timestamps to IST; keep regular-market times only.</li><li>Split chronologically: first 60% train, next 20% validation, final 20% test.</li><li>Threshold and model choice are selected without the final test window.</li><li>Labels crossing the end of a session are excluded.</li><li>Rolling indicators are trailing; no future feature values are used.</li></ul></Panel>
        <Panel><div className="eyebrow">MODEL BASELINES</div><h2>Compare before combining</h2><p className="body-copy">Logistic Regression, Random Forest and histogram gradient boosting are fit on the training block. Macro-F1 on validation selects the champion. The app exposes per-class confusion counts and feature importance; probability calibration and sequence models are not claimed as implemented.</p><div className="model-tags"><span>Logistic</span><span>Random Forest</span><span>Hist. Gradient Boosting</span></div></Panel>
      </div>
    </div>
    <Panel className="evaluation-panel"><div className="eyebrow">EVALUATION OBJECTIVE</div><h2>Judge the signal, then judge the portfolio.</h2><div className="evaluation-grid"><div><b>Classification</b><span>Accuracy · macro precision · recall · F1 · confusion matrix</span></div><div><b>Trading outcome</b><span>Net return · Sharpe · drawdown · win rate · profit factor</span></div><div><b>Execution assumptions</b><span>Transaction costs · ATR stop/target · maximum 3-bar hold · session close</span></div></div></Panel>
    <div className="limitations"><CircleAlert size={18} /><div><strong>Limitations to keep in view</strong><p>The bundled series is synthetic demo data. The local baseline signal is not trained until requested; backtests use a simple lagged-momentum rule, bar-based fills and illustrative costs. It does not model liquidity, market impact, corporate-action adjustments, exchange outages, taxes precisely, broker latency or actual fills. Past or simulated results do not imply future returns.</p></div></div>
  </div>;
}
