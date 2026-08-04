"""
ResumeImprover — Stage 8 of the pipeline (Resume Tailoring).

Generates a JD-tailored version of the candidate's resume: same underlying
facts (employers, dates, degrees — never invented), rewritten emphasis,
ordering, and phrasing to match the target job. Output matches the frontend's
`ResumeContent` shape so it can go straight into ResumePreview / be saved as
a new resume.
"""
from .llm import chat_json

_PROMPT = """You are an expert resume writer. Rewrite the candidate's resume to be tailored \
for the job description below — same real facts (same employers, dates, degrees, projects), \
but reworded, reordered, and re-emphasized to match the job's language and priorities. \
NEVER invent an employer, title, date, degree, or credential that isn't in the original resume. \
You MAY rephrase bullets, reorder skills to lead with JD-relevant ones, and tighten the summary.

Return a single JSON object with exactly these keys (matching a resume builder's data model):
- "summary": a 2-3 sentence professional summary tailored to this job
- "experience": array of {{"position": str, "company": str, "startDate": str, "endDate": str, "current": bool, "bullets": [str]}} — rewritten bullets, tailored emphasis, same facts
- "skills": array of {{"name": str, "level": number 1-100}} — reordered so JD-relevant skills lead; level reflects how prominently/frequently it appears in the original resume
- "education": array of {{"degree": str, "field": str, "institution": str, "endDate": str}}
- "projects": array of {{"name": str, "technologies": str, "description": str}}
- "certifications": array of {{"name": str, "issuer": str}}

Original resume (structured):
{resume_json}

Job description:
\"\"\"
{job_text}
\"\"\"
"""


async def tailor(resume: dict, job: dict) -> dict:
    import json

    resume_summary = {
        "full_name": resume.get("full_name"),
        "job_title": resume.get("job_title"),
        "summary": resume.get("summary"),
        "skills": resume.get("skills"),
        "experience": resume.get("experience"),
        "education": resume.get("education"),
        "projects": resume.get("projects"),
        "certifications": resume.get("certifications"),
    }

    result = await chat_json(
        _PROMPT.format(resume_json=json.dumps(resume_summary, ensure_ascii=False)[:8000],
                       job_text=(job.get("raw_text") or "")[:6000]),
        max_tokens=3000,
    )

    personal_info = {
        "fullName": resume.get("full_name") or "",
        "jobTitle": job.get("job_title") or resume.get("job_title") or "",
        "email": resume.get("email") or "",
        "phone": resume.get("phone") or "",
        "location": resume.get("location") or "",
    }

    if result is None:
        # No AI available — return the parsed original as-is (still real data, just untailored)
        return {
            "personalInfo": personal_info,
            "summary": resume.get("summary") or "",
            "experience": [
                {"position": e.get("title", ""), "company": e.get("company", ""),
                 "startDate": "", "endDate": e.get("duration", ""), "current": False,
                 "bullets": e.get("bullets", [])}
                for e in (resume.get("experience") or [])
            ],
            "skills": [{"name": s, "level": 75} for s in (resume.get("skills") or [])],
            "education": [
                {"degree": e.get("degree", ""), "field": "", "institution": e.get("institution", ""), "endDate": e.get("year", "")}
                for e in (resume.get("education") or [])
            ],
            "projects": [
                {"name": p.get("name", ""), "technologies": ", ".join(p.get("technologies", []) or []), "description": p.get("description", "")}
                for p in (resume.get("projects") or [])
            ],
            "certifications": [{"name": c, "issuer": ""} for c in (resume.get("certifications") or [])],
            "languages": [], "achievements": [], "interests": [],
            "tailored_by": "none",
        }

    return {
        "personalInfo": personal_info,
        "summary": result.get("summary", "") or "",
        "experience": result.get("experience", []) or [],
        "skills": result.get("skills", []) or [],
        "education": result.get("education", []) or [],
        "projects": result.get("projects", []) or [],
        "certifications": result.get("certifications", []) or [],
        "languages": [], "achievements": [], "interests": [],
        "tailored_by": "ai",
    }
