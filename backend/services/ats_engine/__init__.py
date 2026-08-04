"""
ATS Engine — modular, AI-driven ATS analysis.

Pipeline: ResumeParser -> JobParser -> KeywordEngine -> SimilarityService
          -> ATSService -> RecommendationEngine -> ResumeImprover

Each stage is its own module/service so they can be tested, replaced, or
reused independently (e.g. ResumeParser is also usable outside the ATS flow).
"""
from . import (
    resume_parser as ResumeParser,
    job_parser as JobParser,
    keyword_engine as KeywordEngine,
    similarity_service as SimilarityService,
    ats_service as ATSService,
    recommendation_engine as RecommendationEngine,
    resume_improver as ResumeImprover,
)

__all__ = [
    "ResumeParser", "JobParser", "KeywordEngine", "SimilarityService",
    "ATSService", "RecommendationEngine", "ResumeImprover",
]
