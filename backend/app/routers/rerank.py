from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import get_current_user
from app.models.user import User
from app.services.reranker import rerank as rerank_service

router = APIRouter()


class CandidateItem(BaseModel):
    text: str
    score: float | None = None
    id: str | None = None
    url: str | None = None
    title: str | None = None


class RerankRequest(BaseModel):
    query: str
    candidates: list[CandidateItem]
    top_k: int = 10


class RerankResult(BaseModel):
    text: str
    rerank_score: float
    score: float | None = None
    id: str | None = None
    url: str | None = None
    title: str | None = None


class RerankResponse(BaseModel):
    results: list[RerankResult]
    query: str


@router.post("/", response_model=RerankResponse)
async def rerank(
    request: RerankRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    """
    Re-rank ANN candidates using the ms-marco-MiniLM cross-encoder.

    Expects the top-k ANN results from the client's in-browser HNSW search.
    Returns candidates re-ordered by cross-encoder score for improved precision.
    """
    if not request.candidates:
        return RerankResponse(results=[], query=request.query)

    if len(request.candidates) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 100 candidates per request",
        )

    candidate_dicts = [c.model_dump() for c in request.candidates]
    ranked = rerank_service(request.query, candidate_dicts)

    results = [
        RerankResult(**item)
        for item in ranked[: request.top_k]
    ]

    return RerankResponse(results=results, query=request.query)
