from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "return_1", "return_3", "return_5", "return_10", "log_return",
    "rsi_14", "macd", "macd_signal", "bb_percent", "bb_width",
    "ema_9_spread", "ema_21_spread", "ema_50_spread", "vwap_deviation",
    "atr_14", "stoch_k", "stoch_d", "adx_14", "obv_change",
    "volume_zscore", "body_ratio", "upper_wick", "lower_wick",
    "volatility_20", "minutes_since_open", "time_sin", "time_cos",
    "opening_range_breakout",
]


def add_features(bars: pd.DataFrame) -> pd.DataFrame:
    frame = bars.sort_values("datetime").copy().reset_index(drop=True)
    close, high, low, volume = frame["close"], frame["high"], frame["low"], frame["volume"]
    returns = close.pct_change()
    for period in (1, 3, 5, 10):
        frame[f"return_{period}"] = close.pct_change(period)
    frame["log_return"] = np.log(close / close.shift(1))

    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    loss = -delta.clip(upper=0).ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    frame["rsi_14"] = 100 - 100 / (1 + gain / loss.replace(0, np.nan))
    ema_12, ema_26 = close.ewm(span=12, adjust=False).mean(), close.ewm(span=26, adjust=False).mean()
    frame["macd"] = ema_12 - ema_26
    frame["macd_signal"] = frame["macd"].ewm(span=9, adjust=False).mean()

    rolling_mean = close.rolling(20, min_periods=10).mean()
    rolling_std = close.rolling(20, min_periods=10).std()
    upper, lower = rolling_mean + 2 * rolling_std, rolling_mean - 2 * rolling_std
    frame["bb_percent"] = (close - lower) / (upper - lower).replace(0, np.nan)
    frame["bb_width"] = (upper - lower) / rolling_mean
    for period in (9, 21, 50):
        frame[f"ema_{period}_spread"] = close / close.ewm(span=period, adjust=False).mean() - 1

    typical = (high + low + close) / 3
    session_key = frame["datetime"].dt.date
    cumulative_pv = (typical * volume).groupby(session_key).cumsum()
    cumulative_volume = volume.groupby(session_key).cumsum()
    vwap = cumulative_pv / cumulative_volume.replace(0, np.nan)
    frame["vwap_deviation"] = close / vwap - 1
    previous_close = close.shift()
    true_range = pd.concat(
        [high - low, (high - previous_close).abs(), (low - previous_close).abs()],
        axis=1,
    ).max(axis=1)
    frame["atr_14"] = true_range.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()

    lowest, highest = low.rolling(14, min_periods=7).min(), high.rolling(14, min_periods=7).max()
    frame["stoch_k"] = 100 * (close - lowest) / (highest - lowest).replace(0, np.nan)
    frame["stoch_d"] = frame["stoch_k"].rolling(3, min_periods=2).mean()
    plus_dm = high.diff().clip(lower=0)
    minus_dm = -low.diff().clip(upper=0)
    plus_dm = plus_dm.where(plus_dm > minus_dm, 0)
    minus_dm = minus_dm.where(minus_dm > plus_dm, 0)
    atr = true_range.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean() / atr
    minus_di = 100 * minus_dm.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean() / atr
    frame["adx_14"] = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)).ewm(
        alpha=1 / 14, min_periods=14, adjust=False
    ).mean()
    obv = (np.sign(close.diff()).fillna(0) * volume).cumsum()
    frame["obv_change"] = obv.pct_change().replace([np.inf, -np.inf], np.nan)
    vol_mean, vol_std = volume.rolling(30, min_periods=10).mean(), volume.rolling(30, min_periods=10).std()
    frame["volume_zscore"] = (volume - vol_mean) / vol_std.replace(0, np.nan)

    candle_range = (high - low).replace(0, np.nan)
    frame["body_ratio"] = (close - frame["open"]).abs() / candle_range
    frame["upper_wick"] = (high - frame[["open", "close"]].max(axis=1)) / candle_range
    frame["lower_wick"] = (frame[["open", "close"]].min(axis=1) - low) / candle_range
    frame["volatility_20"] = returns.rolling(20, min_periods=10).std()
    minutes = frame["datetime"].dt.hour * 60 + frame["datetime"].dt.minute - (9 * 60 + 15)
    frame["minutes_since_open"] = minutes.clip(0, 375)
    frame["time_sin"] = np.sin(2 * np.pi * frame["minutes_since_open"] / 375)
    frame["time_cos"] = np.cos(2 * np.pi * frame["minutes_since_open"] / 375)
    opening_range = frame["datetime"].dt.time <= pd.Timestamp("09:45").time()
    session_high = high.where(opening_range).groupby(session_key).transform("max")
    session_low = low.where(opening_range).groupby(session_key).transform("min")
    after_opening_range = frame["datetime"].dt.time > pd.Timestamp("09:45").time()
    frame["opening_range_breakout"] = np.select(
        [after_opening_range & (close > session_high), after_opening_range & (close < session_low)],
        [1, -1],
        default=0,
    )
    return frame.replace([np.inf, -np.inf], np.nan)


def label_bars(bars: pd.DataFrame, horizon: int = 3, threshold_scale: float = 0.5) -> pd.Series:
    """Label forward movement using only volatility known at decision time."""
    if horizon < 1:
        raise ValueError("horizon must be positive")
    close = bars["close"]
    log_returns = np.log(close / close.shift(1))
    known_volatility = log_returns.rolling(20, min_periods=10).std()
    forward_return = np.log(close.shift(-horizon) / close)
    threshold = threshold_scale * known_volatility * np.sqrt(horizon)
    if "datetime" in bars:
        forward_time = bars["datetime"].shift(-horizon)
        same_session = (
            (bars["datetime"].dt.date == forward_time.dt.date) &
            (forward_time.dt.time <= pd.Timestamp("15:15").time())
        )
    else:
        same_session = pd.Series(True, index=bars.index)
    labels = pd.Series(np.select(
        [forward_return > threshold, forward_return < -threshold],
        [1, -1],
        default=0,
    ), index=bars.index, dtype="int64")
    labels[threshold.isna() | forward_return.isna() | ~same_session] = np.nan
    return labels


def model_frame(bars: pd.DataFrame, horizon: int = 3) -> pd.DataFrame:
    featured = add_features(bars)
    featured["label"] = label_bars(featured, horizon=horizon)
    return featured.dropna(subset=FEATURE_COLUMNS + ["label"]).reset_index(drop=True)
