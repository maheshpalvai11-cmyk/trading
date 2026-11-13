"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleDot, Cpu, Database, ShieldCheck, Sparkles } from "lucide-react";
import { PageTitle, Panel, StatCard } from "@/components/ui";

const steps = [
  { n: "01", title: "Market data", text: "Clean 5-minute OHLCV bars", icon: Database },
  { n: "02", title: "Feature lab", text: "28 technical & time features", icon: Sparkles },
  { n: "03", title: "Model ensemble", text: "Chronological, calibrated probabilities", icon: Cpu },
  { n: "04", title: "Risk engine", text: "ATR exits · same-day only", icon: ShieldCheck },
];

export default function HomePage() {
  return <div className="page-stack">
    <div className="hero-panel">
      <div className="hero-noise" />
      <div className="hero-content">
        <div className="hero-kicker"><span className="status-dot" />ASTRAQUANT X-2026 <i /> KLH AZIZ NAGAR</div>
        <h1>Read the market.<br /><span>Own the moment.</span></h1>
        <p>Intraday signals, transparent risk and honest backtests — a research workbench built for the next 15 minutes, not overnight bets.</p>
        <div className="hero-actions"><Link href="/dashboard" className="button button-primary">Open dashboard <ArrowRight size={16} /></Link><Link href="/methodology" className="button button-outline">Explore methodology</Link></div>
        <div className="hero-footnote"><ShieldCheck size={14} /> Paper research only · No live order execution</div>
      </div>
      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-center"><ActivityIcon /></div>
        <div className="orbit-chip chip-one"><ArrowUpRight size={14} /> BUY <b>0.72</b></div>
        <div className="orbit-chip chip-two"><ArrowDownRight size={14} /> SELL <b>0.19</b></div>
        <div className="orbit-chip chip-three"><CircleDot size={13} /> ATR <b>12.4</b></div>
        <svg className="sparkline" viewBox="0 0 360 112" fill="none"><path d="M1 82 35 65 62 75 91 40 122 51 149 29 177 43 207 18 235 36 263 14 287 29 316 5 359 17" stroke="url(#line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M1 82 35 65 62 75 91 40 122 51 149 29 177 43 207 18 235 36 263 14 287 29 316 5 359 17V112H1V82Z" fill="url(#fill)" /><defs><linearGradient id="line" x1="20" y1="80" x2="351" y2="10"><stop stopColor="#16a34a" /><stop offset="1" stopColor="#8ee3a8" /></linearGradient><linearGradient id="fill" x1="180" y1="8" x2="180" y2="112"><stop stopColor="#16a34a" stopOpacity=".2" /><stop offset="1" stopColor="#16a34a" stopOpacity="0" /></linearGradient></defs></svg>
      </div>
    </div>

    <PageTitle eyebrow="RESEARCH AT A GLANCE" title="A signal is only as good as its risk." description="One workspace to turn intraday bars into testable, explainable decisions." />
    <div className="stats-grid four">
      <StatCard label="Forecast horizon" value="15 min" change="3 × 5-minute bars" tone="positive" />
      <StatCard label="Market universe" value="05 stocks" change="NSE liquid equities" />
      <StatCard label="Risk framework" value="ATR-based" change="Defined exits on every trade" />
      <StatCard label="Execution mode" value="Simulation" change="No broker connected" />
    </div>
    <Panel className="pipeline-panel">
      <div className="section-heading"><div><div className="eyebrow">HOW IT WORKS</div><h2>From raw bars to a risk-aware signal</h2></div><Link href="/methodology" className="text-link">View the research <ArrowRight size={14} /></Link></div>
      <div className="pipeline-grid">{steps.map(({ n, title, text, icon: Icon }, index) => <motion.div key={n} className="pipeline-step" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
        <div className="pipeline-number">{n}</div><div className="pipeline-icon"><Icon size={18} /></div><h3>{title}</h3><p>{text}</p>{index < steps.length - 1 && <ArrowRight className="pipeline-arrow" size={16} />}
      </motion.div>)}</div>
    </Panel>
    <div className="home-bottom-grid">
      <Panel className="home-callout"><div className="eyebrow">BUILT FOR HONEST EVALUATION</div><h2>Walk forward.<br />Never look ahead.</h2><p>Chronological train / validation / test splits, explicit costs and a forced end-of-day exit keep the backtest grounded in the way intraday trading actually works.</p><Link className="text-link" href="/backtesting">Run a backtest <ArrowRight size={14} /></Link></Panel>
      <Panel className="home-metrics"><div className="eyebrow">WHAT WE MEASURE</div><div className="metric-list"><div><span>Classification</span><strong>Precision · Recall · F1</strong></div><div><span>Risk-adjusted</span><strong>Sharpe · Sortino</strong></div><div><span>Capital protection</span><strong>Max drawdown · Loss limit</strong></div><div><span>Trade quality</span><strong>Expectancy · Profit factor</strong></div></div></Panel>
    </div>
  </div>;
}

function ActivityIcon() {
  return <svg viewBox="0 0 32 32" width="31" height="31" fill="none" aria-hidden="true"><path d="M3 17h6l4-9 6 17 4-10h6" stroke="#7ee09b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
