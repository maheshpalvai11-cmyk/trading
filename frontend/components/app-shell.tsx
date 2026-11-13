"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, CandlestickChart, ChevronLeft, ChevronRight, Database,
  FlaskConical, Gauge, Home, Info, Menu, Moon, Sun, X,
} from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";

const links = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/live", label: "Live signals", icon: Activity },
  { href: "/backtesting", label: "Backtesting", icon: BarChart3 },
  { href: "/performance", label: "Model performance", icon: CandlestickChart },
  { href: "/data-explorer", label: "Data explorer", icon: Database },
  { href: "/methodology", label: "Methodology", icon: FlaskConical },
  { href: "/about", label: "About & risk", icon: Info },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [light, setLight] = useState(false);
  const [apiStatus, setApiStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  useEffect(() => {
    const saved = localStorage.getItem("signalforge-theme");
    setLight(saved === "light");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    localStorage.setItem("signalforge-theme", light ? "light" : "dark");
  }, [light]);
  useEffect(() => {
    let active = true;
    const check = () => void api.health()
      .then((health) => setApiStatus(active && health.status === "ok" && health.database === "connected" ? "connected" : "offline"))
      .catch(() => { if (active) setApiStatus("offline"); });
    check();
    const timer = setInterval(check, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const nav = (
    <>
      <div className="brand">
        <div className="brand-mark"><Activity size={19} strokeWidth={2.5} /></div>
        {!collapsed && <div className="brand-copy"><strong>signalforge<span>.</span></strong><small>QUANT RESEARCH</small></div>}
      </div>
      <div className="nav-caption">{!collapsed && "WORKSPACE"}</div>
      <nav className="side-nav" aria-label="Main navigation">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined}>
            <Icon size={18} /><span>{label}</span>{label === "Live signals" && <i className="live-dot" />}
          </Link>;
        })}
      </nav>
      {!collapsed && <div className="sidebar-bottom">
        <div className="market-status"><span className="status-dot" /><div><b>Market session</b><small>Paper trading · NSE</small></div></div>
        <div className="risk-note">Educational research only. Not investment advice.</div>
      </div>}
    </>
  );

  return (
    <div className="app-frame">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>{nav}
        <button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>
      {mobileOpen && <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`mobile-drawer ${mobileOpen ? "open" : ""}`} aria-label="Mobile navigation">
        <button className="drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={20} /></button>
        {nav}
      </aside>
      <div className={`main-column ${collapsed ? "wide" : ""}`}>
        <header className="topbar">
          <button className="mobile-menu button-icon" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="breadcrumb"><span>SignalForge</span><b>/</b><strong>{links.find((item) => item.href === pathname)?.label || "Research"}</strong></div>
          <div className="topbar-actions"><span className="topbar-market"><i className={`status-dot ${apiStatus === "offline" ? "muted" : ""}`} />{apiStatus === "connected" ? "API · DB CONNECTED" : apiStatus === "offline" ? "API OFFLINE" : "CONNECTING"}</span>
            <button className="button-icon theme-toggle" onClick={() => setLight(!light)} aria-label={`Switch to ${light ? "dark" : "light"} theme`}>{light ? <Moon size={18} /> : <Sun size={18} />}</button>
            <div className="avatar">SF</div>
          </div>
        </header>
        <main className="content-area">{children}</main>
        <footer className="app-footer"><span>SignalForge <b>·</b> Astraquant X-2026</span><span>Research environment · No live orders</span></footer>
      </div>
      <nav className="mobile-tabs" aria-label="Quick navigation">
        {links.slice(1, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""} aria-label={label}><Icon size={19} /><span>{label.split(" ")[0]}</span></Link>)}
      </nav>
    </div>
  );
}
