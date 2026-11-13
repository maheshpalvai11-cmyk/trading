import numpy as np
import pandas as pd

from app.backtest.engine import run_backtest
from app.features.pipeline import add_features, label_bars


def test_labels_use_future_horizon_and_leave_tail_unlabeled():
    close = pd.Series([100.0] * 20 + [110.0] * 3)
    bars = pd.DataFrame({"close": close})
    labels = label_bars(bars, horizon=3, threshold_scale=0.5)
    assert labels.iloc[19] == 1
    assert labels.iloc[-3:].isna().all()


def test_labels_do_not_cross_session_boundary():
    timestamps = pd.date_range("2025-01-02 09:15", periods=12, freq="5min").append(
        pd.date_range("2025-01-03 09:15", periods=5, freq="5min")
    )
    bars = pd.DataFrame({"datetime": timestamps, "close": [100 + i * .1 for i in range(12)] + [120 + i * .1 for i in range(5)]})
    labels = label_bars(bars, horizon=3, threshold_scale=0.5)
    assert labels.iloc[9:12].isna().all()
    assert pd.notna(labels.iloc[12])


def test_labels_respect_intraday_square_off_horizon():
    bars = pd.DataFrame({
        "datetime": pd.date_range("2025-01-02 09:15", periods=75, freq="5min"),
        "close": np.linspace(100, 105, 75),
    })
    labels = label_bars(bars, horizon=3)
    assert pd.notna(labels.iloc[69])  # 15:00 -> 15:15
    assert labels.iloc[70:75].isna().all()


def test_opening_range_feature_is_neutral_during_opening_range():
    timestamps = pd.date_range("2025-01-02 09:15", periods=9, freq="5min")
    bars = pd.DataFrame({
        "datetime": timestamps,
        "open": [100.0] * 9,
        "high": [101.0] * 8 + [120.0],
        "low": [99.0] * 9,
        "close": [100.0] * 8 + [119.0],
        "volume": [1000] * 9,
    })
    features = add_features(bars)
    assert features.loc[0:6, "opening_range_breakout"].eq(0).all()


def test_backtest_is_deterministic_and_reports_valid_equity():
    count = 180
    timestamps = pd.date_range("2025-01-02 09:15", periods=count, freq="5min")
    close = 100 * np.exp(np.cumsum(np.sin(np.arange(count) / 8) * 0.001 + 0.0001))
    bars = pd.DataFrame({
        "datetime": timestamps,
        "open": close * 0.999,
        "high": close * 1.002,
        "low": close * 0.998,
        "close": close,
        "volume": np.full(count, 1000),
    })
    first = run_backtest(bars)
    second = run_backtest(bars)
    assert first["metrics"] == second["metrics"]
    assert first["equity_curve"]
    assert all(point["equity"] > 0 for point in first["equity_curve"])
    assert 0 <= first["metrics"]["max_drawdown_pct"] <= 100
