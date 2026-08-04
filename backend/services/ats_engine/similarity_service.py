"""
SimilarityService — Stage 4+5 of the ATS pipeline (Embedding + Similarity Engine).

Semantic similarity between resume and JD text via OpenAI embeddings +
cosine similarity — catches paraphrased matches that plain keyword matching
misses (e.g. resume says "led a team of engineers", JD says "management
experience"). Falls back to a crude token-overlap ratio if no embedding key
is configured, so the pipeline still produces a number.
"""
import re

from .llm import embed_text, cosine_similarity

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "is", "are", "was", "were", "be", "been", "have",
    "has", "had", "will", "would", "should", "this", "that", "you", "your",
}


def _token_overlap_ratio(a: str, b: str) -> float:
    def tokens(s: str) -> set[str]:
        return {w for w in re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", s.lower()) if len(w) > 2 and w not in _STOPWORDS}
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


async def overall_similarity(resume_text: str, job_text: str) -> dict:
    """Returns {"pct": int, "method": "embedding" | "token_overlap"}."""
    emb_a = await embed_text(resume_text)
    emb_b = await embed_text(job_text)
    if emb_a is not None and emb_b is not None:
        sim = cosine_similarity(emb_a, emb_b)
        return {"pct": round(sim * 100), "method": "embedding"}

    ratio = _token_overlap_ratio(resume_text, job_text)
    return {"pct": round(ratio * 100), "method": "token_overlap"}


async def section_similarity(resume_bullets: list[str], responsibilities: list[str]) -> dict:
    """Semantic match between the candidate's actual bullets and the JD's responsibilities."""
    if not resume_bullets or not responsibilities:
        return {"pct": 0, "method": "insufficient_data"}
    return await overall_similarity(" ".join(resume_bullets), " ".join(responsibilities))
