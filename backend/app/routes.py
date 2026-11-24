from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_analysis_service
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CacheClearResponse,
    CacheStatusResponse,
)
from services.analysis_service import PortfolioAnalysisService

router = APIRouter(prefix="/api", tags=["Portfolio Analytics"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_portfolio(
    req: AnalyzeRequest,
    service: PortfolioAnalysisService = Depends(get_analysis_service),
) -> AnalyzeResponse:
    try:
        return service.analyze(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/cache/status", response_model=CacheStatusResponse)
def get_cache_status(
    service: PortfolioAnalysisService = Depends(get_analysis_service),
) -> CacheStatusResponse:
    return service.get_cache_status()


@router.delete("/cache/clear", response_model=CacheClearResponse)
def clear_cache(
    service: PortfolioAnalysisService = Depends(get_analysis_service),
) -> CacheClearResponse:
    return service.clear_cache()
