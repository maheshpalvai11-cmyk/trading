from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def run_backtest(
    bars: pd.DataFrame,
    threshold: float = 0.55,
    stop_atr: float = 1.0,
    target_atr: float = 1.5,
    capital: float = 100_000,
    cost_bps: float = 8.0,
    horizon: int = 3,
    daily_loss_limit: float = 0.02,
) -> dict[str, Any]:
    if not 0.34 <= threshold <= 0.95:
        raise ValueError("threshold must be between 0.34 and 0.95")
    if stop_atr <= 0 or target_atr <= 0 or capital <= 0 or cost_bps < 0 or horizon < 1:
        raise ValueError("risk multipliers and capital must be positive; costs cannot be negative")
    if not 0 < daily_loss_limit < 1:
        raise ValueError("daily_loss_limit must be between zero and one")
    frame = bars.sort_values("datetime").reset_index(drop=True).copy()
    if len(frame) < 30:
        raise ValueError("At least 30 bars are required for a backtest")
    close, high, low = frame["close"].astype(float), frame["high"].astype(float), frame["low"].astype(float)
    previous_close = close.shift()
    true_range = pd.concat(
        [high - low, (high - previous_close).abs(), (low - previous_close).abs()],
        axis=1,
    ).max(axis=1)
    atr = true_range.ewm(alpha=1 / 14, min_periods=1, adjust=False).mean()
    returns = close.pct_change().fillna(0)
    # A deterministic, lagged momentum probability provides a useful offline baseline.
    score = close.pct_change(3).fillna(0) / (returns.rolling(20, min_periods=3).std().fillna(0.001) * np.sqrt(3))
    up = 1 / (1 + np.exp(-np.clip(score, -8, 8)))
    down = 1 - up
    predictions = np.where(up > threshold, 1, np.where(down > threshold, -1, 0))
    equity, peak, max_drawdown = float(capital), float(capital), 0.0
    equity_curve: list[dict[str, Any]] = []
    trades: list[dict[str, Any]] = []
    position = 0
    quantity = 0
    entry_index = 0
    entry_price = stop_price = target_price = 0.0
    entry_equity = float(capital)
    cost = cost_bps / 10_000
    square_off_time = pd.Timestamp("15:15").time()
    session_date = frame.at[0, "datetime"].date()
    session_start_equity = float(capital)
    daily_locked = False
    for index in range(1, len(frame)):
        current_date = frame.at[index, "datetime"].date()
        previous_date = frame.at[index - 1, "datetime"].date()
        if current_date != session_date:
            session_date = current_date
            session_start_equity = equity
            daily_locked = False
        bar_pnl = 0.0
        if position:
            bar_pnl = position * quantity * (close.iloc[index] - close.iloc[index - 1])
            stopped = low.iloc[index] <= stop_price if position == 1 else high.iloc[index] >= stop_price
            targeted = high.iloc[index] >= target_price if position == 1 else low.iloc[index] <= target_price
            timed_out = index - entry_index >= horizon
            next_date = frame.at[index + 1, "datetime"].date() if index + 1 < len(frame) else current_date
            end_session = (
                next_date != current_date
                or frame.at[index, "datetime"].time() >= square_off_time
                or index == len(frame) - 1
            )
            daily_stop = equity + bar_pnl <= session_start_equity * (1 - daily_loss_limit)
            if stopped or targeted or timed_out or end_session or daily_stop:
                exit_price = stop_price if stopped else target_price if targeted else close.iloc[index]
                trade_pnl = position * quantity * (exit_price - entry_price) - (
                    entry_price + exit_price
                ) * quantity * cost
                trade_return = trade_pnl / entry_equity if entry_equity else 0
                bar_pnl = position * quantity * (exit_price - close.iloc[index - 1]) - (
                    exit_price * quantity * cost
                )
                trades.append({
                    "entry_time": str(frame.at[entry_index, "datetime"]),
                    "exit_time": str(frame.at[index, "datetime"]),
                    "side": "BUY" if position > 0 else "SELL",
                    "entry": round(entry_price, 2),
                    "exit": round(float(exit_price), 2),
                    "pnl": round(trade_pnl, 2),
                    "return_pct": round(trade_return * 100, 4),
                    "result": "WIN" if trade_return > 0 else "LOSS",
                })
                position = 0
                quantity = 0
                if daily_stop:
                    daily_locked = True
        equity += bar_pnl
        if equity <= session_start_equity * (1 - daily_loss_limit):
            daily_locked = True
        if (
            not position
            and not daily_locked
            and index < len(frame) - 1
            and current_date == previous_date
            and current_date == frame.at[index + 1, "datetime"].date()
            and frame.at[index, "datetime"].time() < square_off_time
            and frame.at[index + 1, "datetime"].time() < square_off_time
        ):
            signal = int(predictions[index - 1])
            if signal:
                position = signal
                entry_index = index
                entry_price = float(close.iloc[index])
                distance = max(float(atr.iloc[index]), entry_price * 0.001) * stop_atr
                stop_price = entry_price - signal * distance
                target_price = entry_price + signal * distance * target_atr / stop_atr
                entry_equity = equity
                quantity = int(min(equity * 0.01 / distance, equity / entry_price))
                if quantity < 1:
                    position = 0
                else:
                    equity -= entry_price * quantity * cost
        peak = max(peak, equity)
        drawdown = (peak - equity) / peak if peak else 0
        max_drawdown = max(max_drawdown, drawdown)
        equity_curve.append({
            "datetime": str(frame.at[index, "datetime"]),
            "equity": round(equity, 2),
            "drawdown": round(drawdown * 100, 4),
        })
    pnl_values = [trade["pnl"] for trade in trades]
    wins = [value for value in pnl_values if value > 0]
    losses = [-value for value in pnl_values if value < 0]
    strategy_returns = pd.Series([point["equity"] for point in equity_curve]).pct_change().dropna()
    sharpe = float(strategy_returns.mean() / strategy_returns.std() * np.sqrt(252 * 75)) if len(strategy_returns) > 1 and strategy_returns.std() else 0.0
    return {
        "metrics": {
            "total_return_pct": round((equity / capital - 1) * 100, 2),
            "sharpe": round(sharpe, 2),
            "max_drawdown_pct": round(max_drawdown * 100, 2),
            "win_rate_pct": round(len(wins) / len(trades) * 100, 2) if trades else 0,
            "profit_factor": round(sum(wins) / sum(losses), 2) if losses else (round(sum(wins), 2) if wins else 0),
            "trade_count": len(trades),
            "final_equity": round(equity, 2),
            "daily_loss_limit_pct": round(daily_loss_limit * 100, 2),
        },
        "equity_curve": equity_curve,
        "trades": trades,
    }
