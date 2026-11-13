"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Radio, Search, Wifi, WifiOff } from "lucide-react";
import { PageTitle, Panel, SignalBadge, Skeleton } from "@/components/ui";
import { API_URL, api, socketUrl } from "@/lib/api";
import type { Signal } from "@/lib/types";

export default function LiveSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState(false);
  const [sound, setSound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const newest = useRef("");
  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let polling: ReturnType<typeof setInterval> | null = null;
    const push = (signal: Signal) => {
      if (!active) return;
      if (newest.current && newest.current !== signal.id && sound && signal.signal !== "HOLD") {
        try {
          const audio = new AudioContext();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.frequency.value = signal.signal === "BUY" ? 740 : 420;
          gain.gain.value = 0.06;
          oscillator.connect(gain); gain.connect(audio.destination);
          oscillator.start(); oscillator.stop(audio.currentTime + 0.13);
          oscillator.onended = () => void audio.close();
        } catch { setNotice("Browser audio is unavailable; visual alerts remain active."); }
      }
      newest.current = signal.id;
      setSignals((current) => [signal, ...current.filter((entry) => entry.id !== signal.id)].slice(0, 100));
      setNotice(`${signal.symbol} ${signal.signal} · ${(signal.confidence * 100).toFixed(0)}% confidence`);
    };
    const fallback = () => {
      if (!active || polling) return;
      setConnected(false);
      void api.signals().then((result) => {
        result.signals.forEach(push);
        setLoading(false);
      }).catch(() => setNotice("Live feed unavailable. Confirm the API is running.")).finally(() => {
        polling = setInterval(() => void api.signals().then((result) => result.signals.forEach(push)).catch(() => undefined), 8000);
      });
    };
    void api.signalHistory().then((history) => {
      if (active) {
        setSignals(history.signals);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setNotice("Saved signal history is unavailable; waiting for the live feed.");
    });
    try {
      socket = new WebSocket(socketUrl("/ws/signals"));
      socket.onopen = () => { if (active) setConnected(true); };
      socket.onmessage = (event) => {
        try { push(JSON.parse(event.data) as Signal); setLoading(false); }
        catch { setNotice("Received an unreadable live update."); }
      };
      socket.onerror = fallback;
      socket.onclose = () => { if (active) fallback(); };
    } catch { fallback(); }
    return () => { active = false; socket?.close(); if (polling) clearInterval(polling); };
  }, [sound]);
  const visible = useMemo(() => signals.filter((signal) =>
    (filter === "ALL" || signal.signal === filter) &&
    `${signal.symbol} ${signal.signal}`.toLowerCase().includes(query.toLowerCase())
  ), [signals, filter, query]);

  return <div className="page-stack">
    <PageTitle eyebrow="STREAMING FEED" title="Live signals" description="Follow simulated model updates for the demo NSE universe. No brokerage connection is active." action={<button className="button button-outline" onClick={() => setSound(!sound)}>{sound ? <Bell size={15} /> : <BellOff size={15} />}{sound ? "Sound on" : "Sound off"}</button>} />
    <div className="stats-grid three">
      <div className="feed-status-card"><span className="feed-status-icon"><Radio size={17} /></span><div><small>STREAM STATUS</small><strong className={connected ? "text-green" : ""}>{connected ? "Connected" : "Reconnecting"}</strong></div><i className={`status-dot ${connected ? "" : "muted"}`} /></div>
      <div className="feed-status-card"><span className="feed-status-icon"><Wifi size={17} /></span><div><small>UPDATE MODE</small><strong>{connected ? "WebSocket live" : "Polling fallback"}</strong></div></div>
      <div className="feed-status-card"><span className="feed-status-icon"><Bell size={17} /></span><div><small>ALERTS</small><strong>{sound ? "Audio enabled" : "Visual only"}</strong></div></div>
    </div>
    {notice && <div className="toast-note" role="status">{notice}</div>}
    <Panel className="table-panel">
      <div className="panel-heading table-toolbar"><div><div className="eyebrow">SIGNAL TAPE</div><h2>Recent model decisions <span className="count-pill">{signals.length}</span></h2></div>
        <div className="table-controls"><label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find symbol" aria-label="Filter by symbol" /></label>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter signal type"><option value="ALL">All signals</option><option>BUY</option><option>SELL</option><option>HOLD</option></select></div>
      </div>
      {loading && !signals.length ? <Skeleton rows={7} /> : visible.length ? <div className="table-scroll"><table><thead><tr><th>TIME (IST)</th><th>SYMBOL</th><th>SIGNAL</th><th>CONFIDENCE</th><th>ENTRY</th><th>STOP</th><th>TARGET</th><th>HORIZON</th></tr></thead><tbody>
        {visible.map((signal) => <tr key={signal.id}><td className="table-time">{new Date(signal.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</td><td><strong>{signal.symbol}</strong></td><td><SignalBadge signal={signal.signal} /></td><td><div className="table-confidence"><span>{(signal.confidence * 100).toFixed(0)}%</span><i><b style={{ width: `${signal.confidence * 100}%` }} /></i></div></td><td>₹{signal.entry.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td>{signal.stop_loss ? `₹${signal.stop_loss.toLocaleString("en-IN")}` : "—"}</td><td>{signal.target ? `₹${signal.target.toLocaleString("en-IN")}` : "—"}</td><td>{signal.horizon_bars * 5} min</td></tr>)}
      </tbody></table></div> : <div className="empty-chart"><WifiOff size={18} />No signals match this filter. The stream may still be warming up.</div>}
      <div className="table-foot"><span>Showing {visible.length} of {signals.length} updates</span><span>Feed source: simulated replay <b>·</b> {API_URL.replace(/^https?:\/\//, "")}</span></div>
    </Panel>
    <div className="disclaimer-strip">Signal confidence is a model probability estimate — not a guarantee of future performance. Verify all levels independently.</div>
  </div>;
}
