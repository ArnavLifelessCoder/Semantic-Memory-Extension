"""
Topic clustering pipeline.

UMAP for dimensionality reduction → k-means for cluster assignment.
Used to surface reading pattern clusters in the analytics view.
"""

import numpy as np
import umap
from sklearn.cluster import KMeans


def cluster_embeddings(
    embeddings: list[list[float]],
    n_clusters: int = 20,
    min_cluster_size: int = 3,
) -> dict:
    """
    Cluster a set of embeddings into topic groups.

    Args:
        embeddings: List of 384-dim embedding vectors
        n_clusters: Target number of clusters (auto-adjusted if fewer points)
        min_cluster_size: Minimum points to form a viable cluster

    Returns:
        Dict with 2D coords, cluster labels, centroids, and cluster sizes
    """
    arr = np.array(embeddings, dtype=np.float32)

    if len(arr) < 5:
        return {
            "coords": arr[:, :2].tolist() if arr.shape[1] >= 2 else arr.tolist(),
            "labels": list(range(len(arr))),
            "centroids": [],
            "cluster_sizes": [1] * len(arr),
            "n_clusters": len(arr),
        }

    # Auto-adjust cluster count
    actual_clusters = min(n_clusters, max(2, len(arr) // min_cluster_size))

    # UMAP: reduce to 2D for visualization
    reducer = umap.UMAP(
        n_components=2,
        metric="cosine",
        n_neighbors=min(15, len(arr) - 1),
        random_state=42,
    )
    coords_2d = reducer.fit_transform(arr)

    # k-means clustering on the 2D projection
    kmeans = KMeans(n_clusters=actual_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(coords_2d)

    # Compute cluster sizes
    unique_labels, counts = np.unique(labels, return_counts=True)
    cluster_sizes = dict(zip(unique_labels.tolist(), counts.tolist()))

    return {
        "coords": coords_2d.tolist(),
        "labels": labels.tolist(),
        "centroids": kmeans.cluster_centers_.tolist(),
        "cluster_sizes": cluster_sizes,
        "n_clusters": actual_clusters,
    }
