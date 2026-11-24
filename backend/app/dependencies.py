from __future__ import annotations

from fastapi import Depends, Request

from data.loader import MarketDataStore
from services.analysis_service import PortfolioAnalysisService


def get_market_store(request: Request) -> MarketDataStore:
    store = getattr(request.app.state, "market_store", None)
    if store is None:
        store = MarketDataStore()
        request.app.state.market_store = store
    return store


def get_analysis_service(
    store: MarketDataStore = Depends(get_market_store),
) -> PortfolioAnalysisService:
    return PortfolioAnalysisService(store=store)
