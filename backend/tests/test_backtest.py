import numpy as np
import pandas as pd
import pytest

from app.backtest.engine import run_backtest


def bars_for_one_session(size=90):
    timestamp = pd.date_range("2025-01-02 09:15", periods=size, freq="5min")
    close = 200 * np.exp(np.cumsum(np.sin(np.arange(size) / 7) * 0.001))
    return pd.DataFrame({
        "datetime": timestamp, "open": close * .999, "high": close * 1.002,
        "low": close * .998, "close": close, "volume": np.full(size, 10_000),
    })


@pytest.mark.parametrize("kwargs", [
    {"threshold": .2}, {"stop_atr": 0}, {"target_atr": -1}, {"capital": 0},
    {"cost_bps": -1}, {"daily_loss_limit": 1.0}, {"horizon": 0},
])
def test_backtest_rejects_invalid_risk_inputs(kwargs):
    with pytest.raises(ValueError):
        run_backtest(bars_for_one_session(), **kwargs)


def test_trade_holding_does_not_cross_a_session():
    first = bars_for_one_session(75)
    second = bars_for_one_session(75)
    second["datetime"] = second["datetime"] + pd.Timedelta(days=1)
    bars = pd.concat([first, second], ignore_index=True)
    result = run_backtest(bars)
    assert all(pd.Timestamp(trade["entry_time"]).date() == pd.Timestamp(trade["exit_time"]).date()
               for trade in result["trades"])
