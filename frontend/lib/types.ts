export type Bar = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  atr_14?: number | null;
};

export type Signal = {
  id: string;
  symbol: string;
  timestamp: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  probabilities: { buy: number; sell: number; hold: number };
  entry: number;
  stop_loss: number | null;
  target: number | null;
  atr: number;
  horizon_bars: number;
  source: string;
};

export type BacktestResult = {
  id: string;
  symbol: string;
  metrics: {
    total_return_pct: number;
    sharpe: number;
    max_drawdown_pct: number;
    win_rate_pct: number;
    profit_factor: number;
    trade_count: number;
    final_equity: number;
  };
  equity_curve: { datetime: string; equity: number; drawdown: number }[];
  trades: {
    entry_time: string;
    exit_time: string;
    side: string;
    entry: number;
    exit: number;
    pnl: number;
    return_pct: number;
    result: string;
  }[];
};

export type SavedBacktest = {
  id: string;
  symbol: string;
  created_at: string;
  metrics: BacktestResult["metrics"];
};
