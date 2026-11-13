"use client";

import { AlertCircle, ArrowDownRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function PageTitle({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, change, tone = "neutral" }: {
  label: string; value: string; change?: string; tone?: "positive" | "negative" | "neutral";
}) {
  const Icon = tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : Minus;
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {change && <small className={`stat-change ${tone}`}><Icon size={14} />{change}</small>}
    </div>
  );
}

export function SignalBadge({ signal }: { signal: string }) {
  const Icon = signal === "BUY" ? TrendingUp : signal === "SELL" ? TrendingDown : Minus;
  return <span className={`signal-badge ${signal.toLowerCase()}`}><Icon size={13} />{signal}</span>;
}

export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={19} />
      <div><strong>Couldn’t load this data</strong><span>{error}. Check that the API is running, then try again.</span></div>
      {retry && <button className="button button-quiet" onClick={retry}>Retry</button>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-stack" aria-label="Loading" aria-busy="true">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton-line" />)}
  </div>;
}

export function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}
