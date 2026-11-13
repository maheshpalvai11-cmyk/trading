from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from app.backtest.engine import run_backtest
from app.core.config import settings
from app.data.market_data import MarketDataStore, SYMBOLS
from app.features.pipeline import add_features
from app.models.trainer import train_evaluate
from app.persistence import (
    check_database,
    get_backtest,
    get_model_result,
    get_signal_history,
    list_backtests,
    save_backtest,
    save_model_result,
    save_signal,
)

router = APIRouter()
store = MarketDataStore(settings.data_path)
training_jobs: dict[str, dict[str, Any]] = {}
model_cache: dict[str, dict[str, Any]] = {}
signal_history: list[dict[str, Any]] = []


class FetchRequest(BaseModel):
    symbol: str = "RELIANCE"
    interval: str = "5m"


class BacktestRequest(BaseModel):
    symbol: str = "RELIANCE"
    start_date: str | None = None
    end_date: str | None = None
    threshold: float = Field(default=0.55, ge=0.34, le=0.95)
    stop_atr: float = Field(default=1.0, gt=0, le=10)
    target_atr: float = Field(default=1.5, gt=0, le=20)
    capital: float = Field(default=100_000, gt=0)
    cost_bps: float = Field(default=8, ge=0, le=500)
    daily_loss_limit_pct: float = Field(default=2, gt=0, le=20)


def _symbol_or_404(symbol: str) -> pd.DataFrame:
    try:
        return store.get(symbol)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol.upper()}")


def _ist_timestamp(value: str) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        return timestamp.tz_localize("Asia/Kolkata")
    return timestamp.tz_convert("Asia/Kolkata")


def _serialize_bar(row: pd.Series) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in row.items():
        if pd.isna(value):
            result[key] = None
        elif isinstance(value, pd.Timestamp):
            result[key] = value.isoformat()
        elif hasattr(value, "item"):
            result[key] = value.item()
        else:
            result[key] = value
    return result


def make_latest_signal(symbol: str, data: pd.DataFrame, use_model: bool = True) -> dict[str, Any]:
    eligible = data[data["datetime"].dt.time <= pd.Timestamp("15:00").time()]
    if not eligible.empty:
        data = eligible
    cached = model_cache.get(symbol) if use_model else None
    if cached:
        probs = cached["latest_probabilities"]
        down, hold, up = (float(probs.get(key, 0)) for key in ("-1", "0", "1"))
    else:
        featured = add_features(data)
        row = featured.iloc[-1]
        momentum = float(row.get("return_3", 0) or 0)
        vol = max(float(row.get("volatility_20", 0.001) or 0.001), 0.0005)
        score = max(-8, min(8, momentum / (vol * 1.7)))
        up = 1 / (1 + __import__("math").exp(-score))
        down = 1 - up
        hold = max(0.0, 1 - max(up, down) * 1.55)
        directional = up + down
        up, down = up * (1 - hold) / directional, down * (1 - hold) / directional
    side, confidence = ("BUY", up) if up >= down else ("SELL", down)
    if confidence < 0.55:
        side, confidence = "HOLD", hold
    last = data.iloc[-1]
    entry = float(last["close"])
    features = add_features(data)
    atr = float(features.iloc[-1]["atr_14"])
    if not pd.notna(atr) or atr <= 0:
        atr = entry * 0.005
    direction = 1 if side == "BUY" else -1
    return {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "timestamp": pd.Timestamp(last["datetime"]).isoformat(),
        "signal": side,
        "confidence": round(float(confidence), 4),
        "probabilities": {"sell": round(down, 4), "hold": round(hold, 4), "buy": round(up, 4)},
        "entry": round(entry, 2),
        "stop_loss": round(entry - direction * atr, 2) if side != "HOLD" else None,
        "target": round(entry + direction * atr * 1.5, 2) if side != "HOLD" else None,
        "atr": round(atr, 2),
        "horizon_bars": 3,
        "source": "trained model" if cached else "demo baseline",
    }


def _train_job(job_id: str, symbol: str) -> None:
    training_jobs[job_id] = {"status": "running", "progress": 10, "message": "Preparing chronological dataset"}
    try:
        training_jobs[job_id]["progress"] = 35
        result = train_evaluate(_symbol_or_404(symbol))
        training_jobs[job_id]["progress"] = 90
        model_cache[symbol] = result
        save_model_result(symbol, result)
        training_jobs[job_id] = {
            "status": "completed", "progress": 100, "message": "Training complete",
            "result": {key: value for key, value in result.items() if key not in ("test_labels", "test_probabilities")},
        }
    except Exception as exc:
        training_jobs[job_id] = {"status": "failed", "progress": 100, "message": str(exc)}


@router.get("/health")
def health() -> dict[str, str]:
    check_database()
    return {
        "status": "ok",
        "database": "connected",
        "service": settings.app_name,
        "timestamp": datetime.now().astimezone().isoformat(),
    }


@router.get("/symbols")
def symbols() -> dict[str, list[str]]:
    return {"symbols": list(SYMBOLS)}


@router.post("/data/fetch")
async def fetch_data(request: Request) -> dict[str, Any]:
    """Return local demo data or ingest an uploaded OHLCV CSV."""
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        symbol = str(form.get("symbol", "RELIANCE")).upper()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "file"):
            raise HTTPException(status_code=422, detail="A CSV file is required")
        try:
            uploaded = pd.read_csv(upload.file)
            replaced = store.replace_symbol(symbol, uploaded)
        except (ValueError, pd.errors.ParserError) as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        return {"symbol": symbol, "bars": len(replaced), "source": "uploaded CSV"}
    if "application/json" not in content_type:
        raise HTTPException(status_code=415, detail="Send JSON or multipart/form-data with a CSV file")
    try:
        body = FetchRequest.model_validate(await request.json())
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    symbol = body.symbol.upper()
    data = _symbol_or_404(symbol)
    return {"symbol": symbol, "interval": body.interval, "bars": len(data), "source": "offline demo dataset"}


@router.get("/data/{symbol}")
def get_data(
    symbol: str,
    limit: int = Query(default=300, ge=1, le=5000),
    indicators: bool = True,
) -> dict[str, Any]:
    data = _symbol_or_404(symbol)
    featured = add_features(data) if indicators else data
    return {
        "symbol": symbol.upper(),
        "total": len(featured),
        "bars": [_serialize_bar(row) for _, row in featured.tail(limit).iterrows()],
    }


@router.post("/model/train", status_code=202)
def train_model(payload: FetchRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    symbol = payload.symbol.upper()
    _symbol_or_404(symbol)
    job_id = str(uuid.uuid4())
    training_jobs[job_id] = {"status": "queued", "progress": 0, "message": "Waiting to start"}
    background_tasks.add_task(_train_job, job_id, symbol)
    return {"job_id": job_id, "status": "queued", "websocket": f"/ws/training/{job_id}"}


@router.get("/model/train/{job_id}")
def get_training_job(job_id: str) -> dict[str, Any]:
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Training job not found")
    return training_jobs[job_id]


@router.get("/model/metrics")
def get_model_metrics(symbol: str = "RELIANCE") -> dict[str, Any]:
    symbol = symbol.upper()
    if symbol not in model_cache:
        model_cache[symbol] = get_model_result(symbol) or {}
        if not model_cache[symbol]:
            try:
                model_cache[symbol] = train_evaluate(_symbol_or_404(symbol))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            save_model_result(symbol, model_cache[symbol])
    result = model_cache[symbol]
    selected_test = result["comparison"][result["selected_model"]]["test"]
    return {
        "symbol": symbol,
        "selected_model": result["selected_model"],
        "metrics": selected_test,
        "comparison": result["comparison"],
        "confusion_matrix": result["confusion_matrix"],
        "class_order": result["class_order"],
        "probability_class_order": result["probability_class_order"],
        "test_labels": result["test_labels"],
        "test_probabilities": result["test_probabilities"],
        "model_rows": result["model_rows"],
    }


@router.get("/model/explain")
def explain_model(symbol: str = "RELIANCE") -> dict[str, Any]:
    get_model_metrics(symbol)
    return {"symbol": symbol.upper(), "features": model_cache[symbol.upper()]["feature_importance"]}


@router.get("/signals/latest")
def latest_signals(symbol: str | None = None) -> dict[str, Any]:
    requested = [symbol.upper()] if symbol else list(SYMBOLS)
    results = [make_latest_signal(name, _symbol_or_404(name)) for name in requested]
    results = [save_signal(result) for result in results]
    return {"signals": sorted(results, key=lambda item: item["timestamp"], reverse=True)}


@router.get("/signals/history")
def read_signal_history(
    symbol: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    return {"signals": get_signal_history(limit=limit, symbol=symbol)}


@router.post("/backtest/run", status_code=201)
def create_backtest(payload: BacktestRequest) -> dict[str, Any]:
    data = _symbol_or_404(payload.symbol)
    if payload.start_date:
        data = data[data["datetime"] >= _ist_timestamp(payload.start_date)]
    if payload.end_date:
        end = _ist_timestamp(payload.end_date).normalize() + pd.Timedelta(days=1)
        data = data[data["datetime"] < end]
    try:
        result = run_backtest(
            data, threshold=payload.threshold, stop_atr=payload.stop_atr,
            target_atr=payload.target_atr, capital=payload.capital, cost_bps=payload.cost_bps,
            daily_loss_limit=payload.daily_loss_limit_pct / 100,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    run_id = str(uuid.uuid4())
    result.update({"id": run_id, "symbol": payload.symbol.upper()})
    save_backtest(run_id, result)
    return result


@router.get("/backtest")
def recent_backtests(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    return {"runs": list_backtests(limit=limit)}


@router.get("/backtest/{run_id}")
def read_backtest(run_id: str) -> dict[str, Any]:
    result = get_backtest(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Backtest run not found")
    return result


async def signal_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    replay: dict[str, pd.DataFrame] = {}
    cursors: dict[str, int] = {}
    for symbol in SYMBOLS:
        history = store.get(symbol)
        history = history[history["datetime"].dt.time <= pd.Timestamp("15:00").time()].reset_index(drop=True)
        replay[symbol] = history
        cursors[symbol] = max(0, len(history) - 30)
    try:
        while True:
            for symbol in SYMBOLS:
                history = replay[symbol]
                if cursors[symbol] >= len(history):
                    cursors[symbol] = max(0, len(history) - 30)
                signal = make_latest_signal(symbol, history.iloc[:cursors[symbol] + 1], use_model=False)
                cursors[symbol] += 1
                signal = save_signal(signal)
                signal_history.insert(0, signal)
                del signal_history[100:]
                await websocket.send_json(signal)
            await asyncio.sleep(4)
    except WebSocketDisconnect:
        return


async def training_websocket(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    try:
        while True:
            job = training_jobs.get(job_id, {"status": "not_found", "progress": 0})
            await websocket.send_json({key: value for key, value in job.items() if key != "result"})
            if job.get("status") in ("completed", "failed", "not_found"):
                return
            await asyncio.sleep(0.75)
    except WebSocketDisconnect:
        return
