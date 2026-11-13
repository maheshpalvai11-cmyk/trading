from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

SYMBOLS = ("RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN")
OHLCV_COLUMNS = ("datetime", "open", "high", "low", "close", "volume")
IST = "Asia/Kolkata"
BAR_FREQ = "5min"


def generate_demo_data(days: int = 24, seed: int = 42) -> pd.DataFrame:
    """Create reproducible regular-session bars for an offline demo."""
    rng = np.random.default_rng(seed)
    last_completed_date = (pd.Timestamp.now(tz=IST) - pd.Timedelta(days=1)).date()
    sessions = pd.bdate_range(end=last_completed_date, periods=days)
    frames: list[pd.DataFrame] = []
    starting_prices = {"RELIANCE": 1450, "TCS": 3850, "INFY": 1720, "HDFCBANK": 1640, "SBIN": 760}
    for symbol_index, symbol in enumerate(SYMBOLS):
        symbol_frames = []
        prior_close = float(starting_prices[symbol])
        for day_index, day in enumerate(sessions):
            local_open = pd.Timestamp(day.date()).tz_localize(IST) + pd.Timedelta(hours=9, minutes=15)
            times = pd.date_range(local_open, periods=75, freq=BAR_FREQ)
            intraday_drift = 0.00006 * np.sin(np.linspace(0, np.pi * 2, len(times)))
            returns = rng.normal(0.00005, 0.0025 + symbol_index * 0.00012, len(times)) + intraday_drift
            open_prices = np.empty(len(times))
            close_prices = np.empty(len(times))
            previous = prior_close * (1 + rng.normal(0, 0.001))
            for index, bar_return in enumerate(returns):
                open_prices[index] = previous
                close_prices[index] = previous * np.exp(bar_return)
                previous = close_prices[index]
            spread = np.abs(rng.normal(0.0010, 0.0005, len(times)))
            highs = np.maximum(open_prices, close_prices) * (1 + spread)
            lows = np.minimum(open_prices, close_prices) * (1 - spread)
            volumes = rng.integers(25_000, 550_000, len(times))
            symbol_frames.append(pd.DataFrame({
                "datetime": times,
                "open": open_prices,
                "high": highs,
                "low": lows,
                "close": close_prices,
                "volume": volumes,
                "symbol": symbol,
            }))
            prior_close = float(close_prices[-1])
        frames.extend(symbol_frames)
    return pd.concat(frames, ignore_index=True).sort_values(["symbol", "datetime"]).reset_index(drop=True)


def clean_ohlcv(frame: pd.DataFrame) -> pd.DataFrame:
    missing = set(OHLCV_COLUMNS) - set(frame.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
    cleaned = frame.copy()
    parsed = pd.to_datetime(cleaned["datetime"], errors="coerce")
    if parsed.isna().any():
        raise ValueError("datetime contains invalid values")
    if parsed.dt.tz is None:
        parsed = parsed.dt.tz_localize(IST, ambiguous="NaT", nonexistent="shift_forward")
    else:
        parsed = parsed.dt.tz_convert(IST)
    cleaned["datetime"] = parsed
    for column in ("open", "high", "low", "close", "volume"):
        cleaned[column] = pd.to_numeric(cleaned[column], errors="coerce")
    cleaned = cleaned.dropna(subset=list(OHLCV_COLUMNS))
    cleaned = cleaned[(cleaned["open"] > 0) & (cleaned["high"] > 0) &
                      (cleaned["low"] > 0) & (cleaned["close"] > 0) &
                      (cleaned["volume"] >= 0)]
    cleaned = cleaned[
        (cleaned["datetime"].dt.time >= pd.Timestamp("09:15").time()) &
        (cleaned["datetime"].dt.time <= pd.Timestamp("15:30").time())
    ]
    cleaned = cleaned.drop_duplicates(["symbol", "datetime"] if "symbol" in cleaned else ["datetime"])
    return cleaned.sort_values(["symbol", "datetime"] if "symbol" in cleaned else ["datetime"]).reset_index(drop=True)


class MarketDataStore:
    def __init__(self, path: str):
        self.path = Path(path)
        if self.path.exists():
            self.frame = clean_ohlcv(pd.read_csv(self.path))
            if "symbol" not in self.frame:
                self.frame["symbol"] = "RELIANCE"
        else:
            self.frame = generate_demo_data()

    def get(self, symbol: str) -> pd.DataFrame:
        result = self.frame[self.frame["symbol"].str.upper() == symbol.upper()].copy()
        if result.empty:
            raise KeyError(symbol.upper())
        return result.sort_values("datetime").reset_index(drop=True)

    def replace_symbol(self, symbol: str, uploaded: pd.DataFrame) -> pd.DataFrame:
        uploaded = clean_ohlcv(uploaded)
        uploaded["symbol"] = symbol.upper()
        self.frame = pd.concat(
            [self.frame[self.frame["symbol"] != symbol.upper()], uploaded],
            ignore_index=True,
        ).sort_values(["symbol", "datetime"]).reset_index(drop=True)
        return uploaded
