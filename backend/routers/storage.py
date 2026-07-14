"""User file storage (Supabase Storage) — list + delete, scoped to the caller."""
from fastapi import APIRouter, Depends, HTTPException

from models import User
from services.deps import get_current_user
from services.storage import list_user_files, delete_file

router = APIRouter(prefix="/api/storage", tags=["Storage"])


@router.get("/files")
async def get_files(user: User = Depends(get_current_user)):
    return list_user_files(str(user.id))


@router.delete("/files")
async def remove_file(path: str, user: User = Depends(get_current_user)):
    if delete_file(str(user.id), path):
        return {"deleted": True}
    raise HTTPException(status_code=400, detail="Could not delete file (not found or not yours).")
