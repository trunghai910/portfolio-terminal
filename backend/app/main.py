from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router
from app.schemas import HealthResponse
from config.settings import API_CORS_ALLOW_CREDENTIALS, API_CORS_ORIGINS
from data.loader import MarketDataStore


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.market_store = MarketDataStore()
    yield


app = FastAPI(
    title="Quant Portfolio Terminal API",
    description="High-performance Polars + DuckDB + NumPy/SciPy Quantitative Portfolio Engine",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=API_CORS_ORIGINS,
    allow_credentials=API_CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", engine="polars-duckdb-numpy-scipy")
