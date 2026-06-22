"""
Cross-encoder re-ranking service.

Uses ms-marco-MiniLM-L-6-v2 to re-rank ANN candidates for precision.
Model is loaded lazily on first request to avoid startup latency.
"""

from sentence_transformers import CrossEncoder


_model: CrossEncoder | None = None


def _get_model() -> CrossEncoder:
    global _model
    if _model is None:
        _model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _model


def rerank(query: str, candidates: list[dict]) -> list[dict]:
    """
    Re-rank candidates using the cross-encoder.

    Args:
        query: The user's search query
        candidates: List of dicts, each must have a 'text' key

    Returns:
        Candidates sorted by cross-encoder score (descending),
        with a 'rerank_score' field added.
    """
    if not candidates:
        return []

    model = _get_model()
    pairs = [(query, c["text"]) for c in candidates]
    scores = model.predict(pairs)

    ranked = sorted(
        zip(candidates, scores),
        key=lambda x: float(x[1]),
        reverse=True,
    )

    return [
        {**c, "rerank_score": round(float(s), 4)}
        for c, s in ranked
    ]
