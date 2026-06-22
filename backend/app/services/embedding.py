"""
Server-side embedding service.

Uses sentence-transformers for generating embeddings on sync'd data.
Model is loaded lazily on first request.
"""

from sentence_transformers import SentenceTransformer
import numpy as np


_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Generate 384-dim embeddings for a list of texts.

    Args:
        texts: List of text strings to embed

    Returns:
        List of embedding vectors (each 384 floats)
    """
    if not texts:
        return []

    model = _get_model()
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)

    if isinstance(embeddings, np.ndarray):
        return embeddings.tolist()
    return [e.tolist() for e in embeddings]


def embed_single(text: str) -> list[float]:
    """Generate a single 384-dim embedding."""
    results = embed_texts([text])
    return results[0] if results else []
