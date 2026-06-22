from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import get_current_user
from app.models.user import User
from app.services.clustering import cluster_embeddings

router = APIRouter()


class ClusterRequest(BaseModel):
    embeddings: list[list[float]]
    n_clusters: int = 20


class ClusterResponse(BaseModel):
    coords: list[list[float]]
    labels: list[int]
    centroids: list[list[float]]
    cluster_sizes: dict[int, int] | dict
    n_clusters: int


@router.post("/clusters", response_model=ClusterResponse)
async def compute_clusters(
    request: ClusterRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    """
    UMAP + k-means topic clustering on user embeddings.

    Accepts a batch of embedding vectors and returns:
    - 2D coordinates (for visualization)
    - Cluster labels per embedding
    - Cluster centroids
    - Cluster size distribution
    """
    if len(request.embeddings) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Need at least 2 embeddings for clustering",
        )

    if len(request.embeddings) > 50_000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 50,000 embeddings per request",
        )

    # Validate embedding dimensions
    expected_dim = 384
    for i, emb in enumerate(request.embeddings):
        if len(emb) != expected_dim:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Embedding {i} has {len(emb)} dimensions, expected {expected_dim}",
            )

    result = cluster_embeddings(
        request.embeddings,
        n_clusters=request.n_clusters,
    )

    return ClusterResponse(**result)


@router.get("/stats")
async def get_stats(
    user: Annotated[User, Depends(get_current_user)],
):
    """Placeholder for per-user analytics stats (reading patterns, etc.)."""
    return {
        "total_pages": 0,
        "total_chunks": 0,
        "top_domains": [],
        "reading_streak_days": 0,
    }
