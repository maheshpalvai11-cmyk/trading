from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)


class TradeRecord(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("backtest_runs.id"), index=True)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False)
    result: Mapped[str] = mapped_column(String(8), nullable=False)


class SignalRecord(Base):
    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    timestamp: Mapped[str] = mapped_column(String, nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)


class SignalSnapshot(Base):
    __tablename__ = "signal_snapshots"
    __table_args__ = (UniqueConstraint("symbol", "timestamp", name="uq_signal_snapshot_bar"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    timestamp: Mapped[str] = mapped_column(String, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)


class ModelRun(Base):
    __tablename__ = "model_runs"

    symbol: Mapped[str] = mapped_column(String(24), primary_key=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)


database_url = settings.database_url or os.getenv("DATABASE_URL")
if not database_url:
    database_path = settings.database_path or os.getenv("DATABASE_PATH", "backend/data/signalforge.db")
    os.makedirs(os.path.dirname(database_path) or ".", exist_ok=True)
    database_url = f"sqlite:///{os.path.abspath(database_path).replace(os.sep, '/')}"
engine = create_engine(
    database_url,
    connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)


def check_database() -> bool:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True


def save_backtest(run_id: str, result: dict[str, Any]) -> None:
    with SessionLocal.begin() as session:
        session.add(BacktestRun(
            id=run_id,
            symbol=str(result["symbol"]),
            result_json=json.dumps(result),
        ))
        session.add_all([
            TradeRecord(
                run_id=run_id,
                side=trade["side"],
                entry_price=trade["entry"],
                exit_price=trade["exit"],
                pnl=trade["pnl"],
                result=trade["result"],
            )
            for trade in result["trades"]
        ])


def get_backtest(run_id: str) -> dict[str, Any] | None:
    with SessionLocal() as session:
        run = session.get(BacktestRun, run_id)
        return json.loads(run.result_json) if run else None


def list_backtests(limit: int = 20) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        runs = session.scalars(
            select(BacktestRun).order_by(BacktestRun.created_at.desc()).limit(limit)
        ).all()
        return [
            {
                "id": run.id,
                "symbol": run.symbol,
                "created_at": run.created_at.isoformat(),
                "metrics": json.loads(run.result_json)["metrics"],
            }
            for run in runs
        ]


def save_model_result(symbol: str, result: dict[str, Any]) -> None:
    with SessionLocal.begin() as session:
        model_run = session.get(ModelRun, symbol)
        if model_run is None:
            session.add(ModelRun(symbol=symbol, result_json=json.dumps(result)))
        else:
            model_run.trained_at = datetime.now(timezone.utc)
            model_run.result_json = json.dumps(result)


def get_model_result(symbol: str) -> dict[str, Any] | None:
    with SessionLocal() as session:
        model_run = session.get(ModelRun, symbol)
        return json.loads(model_run.result_json) if model_run else None


def save_signal(signal: dict[str, Any]) -> dict[str, Any]:
    with SessionLocal.begin() as session:
        existing = session.scalar(select(SignalSnapshot).where(
            SignalSnapshot.symbol == signal["symbol"],
            SignalSnapshot.timestamp == signal["timestamp"],
        ))
        if existing:
            return json.loads(existing.payload_json)
        if not session.scalar(select(SignalRecord.id).where(
            SignalRecord.symbol == signal["symbol"],
            SignalRecord.timestamp == signal["timestamp"],
        )):
            session.add(SignalRecord(
                id=signal["id"],
                symbol=signal["symbol"],
                timestamp=signal["timestamp"],
                direction=signal["signal"],
                confidence=signal["confidence"],
            ))
        session.add(SignalSnapshot(
            symbol=signal["symbol"],
            timestamp=signal["timestamp"],
            payload_json=json.dumps(signal),
        ))
    return signal


def get_signal_history(limit: int = 100, symbol: str | None = None) -> list[dict[str, Any]]:
    statement = select(SignalSnapshot).order_by(SignalSnapshot.timestamp.desc()).limit(limit)
    if symbol:
        statement = statement.where(SignalSnapshot.symbol == symbol.upper())
    with SessionLocal() as session:
        snapshots = session.scalars(statement).all()
        return [json.loads(snapshot.payload_json) for snapshot in snapshots]
