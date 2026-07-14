from typing import Any, Union
from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator

from services.auth import verify_token
from services.usage import set_usage_context
from services.ai import (
    generate_bullets, enhance_bullet, generate_summary, generate_cover_letter,
    suggest_skills, generate_interview_questions, answer_feedback, sample_answer,
    skill_gap,
)

router = APIRouter(prefix="/api/ai", tags=["AI"])
security = HTTPBearer()


async def _auth(request: Request, c: HTTPAuthorizationCredentials = Depends(security)):
    user = await verify_token(c.credentials)
    # tag AI token usage with the caller + which feature (last path segment)
    feature = request.url.path.rstrip("/").rsplit("/", 1)[-1] or "ai"
    set_usage_context(str(user.id), feature)
    return user


class BulletRequest(BaseModel):
    position: str
    company: str = ""
    description: str = ""


class EnhanceRequest(BaseModel):
    bullet: str


class SummaryRequest(BaseModel):
    # Accept both string (from AI writer) and list (from editor)
    experience: Any = ""
    skills: Any = ""

    @field_validator("experience", mode="before")
    @classmethod
    def coerce_experience(cls, v):
        if isinstance(v, list):
            parts = []
            for item in v:
                if isinstance(item, dict):
                    pos = item.get("position", "")
                    co = item.get("company", "")
                    parts.append(f"{pos} at {co}" if pos or co else str(item))
                else:
                    parts.append(str(item))
            return ", ".join(parts)
        return str(v) if v else ""

    @field_validator("skills", mode="before")
    @classmethod
    def coerce_skills(cls, v):
        if isinstance(v, list):
            return ", ".join(str(s.get("name", s) if isinstance(s, dict) else s) for s in v)
        return str(v) if v else ""


class CoverLetterRequest(BaseModel):
    job_title: str
    company: str
    job_description: str
    applicant_name: str = ""
    resume_summary: str = ""


class SkillsSuggestRequest(BaseModel):
    job_title: str = ""
    existing: list[str] = []


class InterviewQuestionsRequest(BaseModel):
    job_title: str = ""


class FeedbackRequest(BaseModel):
    question: str
    answer: str


class SampleAnswerRequest(BaseModel):
    question: str
    job_title: str = ""


class SkillGapRequest(BaseModel):
    target: str = ""              # target job title OR pasted job description
    current_skills: list[str] = []


@router.post("/generate-bullets")
async def api_generate_bullets(req: BulletRequest, _=Depends(_auth)):
    bullets = await generate_bullets(req.position, req.company, req.description)
    return {"bullets": bullets}


@router.post("/enhance-bullet")
async def api_enhance_bullet(req: EnhanceRequest, _=Depends(_auth)):
    enhanced = await enhance_bullet(req.bullet)
    return {"enhanced": enhanced}


@router.post("/generate-summary")
async def api_generate_summary(req: SummaryRequest, _=Depends(_auth)):
    summary = await generate_summary(str(req.experience), str(req.skills))
    return {"summary": summary}


@router.post("/generate-cover-letter")
async def api_generate_cover_letter(req: CoverLetterRequest, _=Depends(_auth)):
    letter = await generate_cover_letter(
        req.job_title, req.company, req.job_description,
        req.applicant_name, req.resume_summary,
    )
    return {"cover_letter": letter}


@router.post("/suggest-skills")
async def api_suggest_skills(req: SkillsSuggestRequest, _=Depends(_auth)):
    skills = await suggest_skills(req.job_title, req.existing)
    return {"skills": skills}


@router.post("/interview-questions")
async def api_interview_questions(req: InterviewQuestionsRequest, _=Depends(_auth)):
    questions = await generate_interview_questions(req.job_title)
    return {"questions": questions}


@router.post("/answer-feedback")
async def api_answer_feedback(req: FeedbackRequest, _=Depends(_auth)):
    feedback = await answer_feedback(req.question, req.answer)
    return {"feedback": feedback}


@router.post("/sample-answer")
async def api_sample_answer(req: SampleAnswerRequest, _=Depends(_auth)):
    answer = await sample_answer(req.question, req.job_title)
    return {"answer": answer}


@router.post("/skill-gap")
async def api_skill_gap(req: SkillGapRequest, _=Depends(_auth)):
    return await skill_gap(req.target, req.current_skills)
