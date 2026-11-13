from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router, signal_websocket, training_websocket
from app.core.config import settings

app = FastAPI(
    title="SignalForge API",
    description="Offline-first intraday research signals and backtesting API. Educational use only.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=settings.api_prefix)


@app.websocket("/ws/signals")
async def signals_socket(websocket: WebSocket) -> None:
    await signal_websocket(websocket)


@app.websocket("/ws/training/{job_id}")
async def training_socket(websocket: WebSocket, job_id: str) -> None:
    await training_websocket(websocket, job_id)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs", "status": "ok"}
