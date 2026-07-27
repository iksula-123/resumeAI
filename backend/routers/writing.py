"""
Writing assistance (Milestone G).

  POST /api/writing/grammar  → LOCAL grammar & spell check (no paid API)

Role-based skill suggestions already live at /api/ai/suggest-skills.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from models import User
from services.deps import get_current_user
from services.grammar import check_text, check_many

router = APIRouter(prefix="/api/writing", tags=["Writing"])


class GrammarRequest(BaseModel):
    text: str | None = None            # check a single block
    texts: list[str] | None = None     # or several (e.g. all bullets) at once


@router.post("/grammar")
async def grammar(req: GrammarRequest, user: User = Depends(get_current_user)):
    if req.texts is not None:
        results = check_many(req.texts)
        return {"results": results, "num_fixes": sum(r["num_fixes"] for r in results)}
    return check_text(req.text or "")
