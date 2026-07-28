"""
Role-profile service (Milestone C — the pre-fill USP).

Reads the TAF-derived `role_profiles` library and assembles the candidate-confirmed
build flow. Nothing here is written to a resume as fact: suggestions are returned
tagged by source so the UI can colour-code them —
  green = candidate's EduBridge record (career_record)
  blue  = AI-suggested for this role (must be confirmed)
  grey  = scaffolds the candidate personalises with their own content
"""
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai import role_summary_suggestion


# ── DB reads ────────────────────────────────────────────────────────────────
async def list_roles(db: AsyncSession, search: str = "", limit: int = 30) -> list[dict]:
    """Role picker feed: top roles by demand, optionally filtered by title search.

    Search is token-based and forgiving: a role matches if its title contains ANY
    search word, so "frontend developer" surfaces Web/Software/Java Developer even
    though no title is literally "Frontend Developer". Results with more matching
    tokens rank first, then by demand.
    """
    limit = max(1, min(int(limit or 30), 100))
    params: dict = {"limit": limit}
    where = ""
    order = "demand_count desc"
    if search and search.strip():
        tokens = [t for t in re.split(r"\s+", search.strip().lower()) if len(t) >= 2][:6]
        if tokens:
            likes, score_terms = [], []
            for i, tok in enumerate(tokens):
                params[f"t{i}"] = f"%{tok}%"
                likes.append(f"canonical_title ilike :t{i}")
                score_terms.append(f"(case when canonical_title ilike :t{i} then 1 else 0 end)")
            where = "where " + " or ".join(likes)
            # rank by how many tokens matched, then demand
            order = f"({' + '.join(score_terms)}) desc, demand_count desc"
    rows = (await db.execute(text(
        f"""select slug, canonical_title, industry, salary_min, salary_max,
                   demand_count, skills
            from public.role_profiles
            {where}
            order by {order}
            limit :limit"""
    ), params)).mappings().all()
    return [
        {
            "slug": r["slug"],
            "canonical_title": r["canonical_title"],
            "industry": r["industry"],
            "salary_min": r["salary_min"],
            "salary_max": r["salary_max"],
            "demand_count": r["demand_count"],
            "top_skills": (list(r["skills"]) if r["skills"] else [])[:5],
        }
        for r in rows
    ]


async def get_role(db: AsyncSession, slug: str) -> dict | None:
    r = (await db.execute(text(
        """select slug, canonical_title, skills, skills_detail, education,
                  selection_process, salary_min, salary_max, industry, sub_sector,
                  category, demand_count
           from public.role_profiles where slug = :slug"""
    ), {"slug": slug})).mappings().first()
    if not r:
        return None
    d = dict(r)
    d["skills"] = list(d["skills"]) if d["skills"] else []
    return d


async def get_career_record(db: AsyncSession, user_id) -> dict | None:
    r = (await db.execute(text(
        """select education, edubridge_training, certificates, college, course,
                  jree_score
           from public.career_record where user_id = :uid"""
    ), {"uid": str(user_id)})).mappings().first()
    return dict(r) if r else None


# ── Build-flow assembly ──────────────────────────────────────────────────────
_ACTION_VERBS = ["Assisted with", "Handled", "Supported", "Managed", "Coordinated",
                 "Achieved", "Improved", "Contributed to"]


def bullet_scaffolds(role_title: str, skills: list[str]) -> list[str]:
    """Action-verb starters with blanks (GREY) for the candidate to personalise.

    These are templates, never facts — the ____ blanks are filled in by the
    candidate with their own real experience.
    """
    top = [s for s in (skills or [])][:3]
    scaffolds = [
        f"Assisted with ______ as part of my {role_title.lower()} responsibilities, resulting in ______.",
        "Handled ______ on a daily basis, ensuring ______.",
        "Achieved ______ by ______ (add a number or result where you can).",
    ]
    for skill in top:
        scaffolds.append(f"Used {skill} to ______, which helped ______.")
    scaffolds.append("Learned ______ and applied it to ______.")
    return scaffolds[:6]


def ats_keywords(role: dict) -> list[str]:
    """Role-demanded ATS / recruiter keywords (surfaced, not auto-inserted)."""
    kws: list[str] = []
    seen = set()

    def add(item: str):
        item = (item or "").strip()
        k = item.lower()
        if item and k not in seen:
            seen.add(k)
            kws.append(item)

    for tok in (role.get("canonical_title") or "").split():
        if len(tok) > 2:
            add(tok)
    for s in role.get("skills") or []:
        add(s)
    for extra in (role.get("industry"), role.get("category"), role.get("sub_sector")):
        if extra:
            add(extra)
    return kws[:15]


async def build_prefill(db: AsyncSession, role: dict, career: dict | None) -> dict:
    """Assemble the full candidate-confirmed build flow for one role."""
    skills = role.get("skills") or []
    # Phase-1 audience is the learner pilot, so summaries default to fresher-safe
    # (EduBridge training is not work experience). Refine when we track real experience.
    is_fresher = True

    # green — EduBridge verified record (may be empty if the user has none yet)
    green = {
        "education": (career or {}).get("education") or [],
        "edubridge_training": (career or {}).get("edubridge_training") or [],
        "certificates": (career or {}).get("certificates") or [],
        "college": (career or {}).get("college"),
        "course": (career or {}).get("course"),
        "has_record": bool(career),
    }

    # blue — AI-suggested, requires candidate confirmation
    summary = await role_summary_suggestion(
        role["canonical_title"], skills, role.get("industry") or "", is_fresher
    )
    blue = {
        "summary": summary,                                    # editable, confirm
        "skills_checklist": [{"skill": s, "checked": False} for s in skills],  # tick to confirm
    }

    # grey — scaffolds the candidate fills with their own content
    grey = {"bullet_scaffolds": bullet_scaffolds(role["canonical_title"], skills)}

    return {
        "role": {
            "slug": role["slug"],
            "canonical_title": role["canonical_title"],
            "industry": role.get("industry"),
            "sub_sector": role.get("sub_sector"),
            "category": role.get("category"),
            "salary_min": role.get("salary_min"),
            "salary_max": role.get("salary_max"),
            "typical_education": role.get("education"),
            "typical_selection_process": role.get("selection_process"),
            "demand_count": role.get("demand_count"),
        },
        "green": green,
        "blue": blue,
        "grey": grey,
        "ats_keywords": ats_keywords(role),
        "is_fresher": is_fresher,
    }
