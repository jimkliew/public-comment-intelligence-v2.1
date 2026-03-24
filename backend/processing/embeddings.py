"""Embedding generation and similarity search using sentence-transformers + FAISS."""

import numpy as np
from sentence_transformers import SentenceTransformer
from config import get_settings

_model = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(get_settings().embedding_model)
    return _model


def generate_embeddings(texts: list[str], batch_size: int = 64) -> np.ndarray:
    """Generate dense embeddings for a list of texts.

    Returns numpy array of shape (len(texts), embedding_dim).
    """
    model = get_model()
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        normalize_embeddings=True,  # L2 normalize for cosine similarity via dot product
    )
    return np.array(embeddings, dtype=np.float32)
