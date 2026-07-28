"""
Career-record ingestion (Milestone C USP enabler).

Lets EduBridge's systems (LMS / college DB) populate the GREEN, verified record
a resume auto-fills from — training, certificates, college, course — keyed by the
learner's email. Used by the admin/service ingest endpoints and the CSV import
script so they share one upsert path.
"""
import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_user_id_by_email(db: AsyncSession, email: str) -> uuid.UUID | None:
    if not email:
        return None
    row = (await db.execute(
        text("select id from public.profiles where lower(email) = lower(:e)"),
        {"e": email.strip()},
    )).first()
    return row[0] if row else None


async def upsert_career_record(db: AsyncSession, user_id, data: dict, merge: bool = False) -> None:
    """Insert/update one learner's EduBridge record.

    merge=False (self-service edit): full replace — the payload is authoritative,
      so an empty array clears that section.
    merge=True (ingestion): partial — only non-empty incoming values overwrite, so
      the LMS and the college DB can each push their own fields without wiping the
      other's (e.g. a college-only push won't erase LMS training).
    """
    tbl = "public.career_record"
    if merge:
        update = (
            f"education = case when jsonb_array_length(excluded.education) > 0 then excluded.education else {tbl}.education end, "
            f"edubridge_training = case when jsonb_array_length(excluded.edubridge_training) > 0 then excluded.edubridge_training else {tbl}.edubridge_training end, "
            f"certificates = case when jsonb_array_length(excluded.certificates) > 0 then excluded.certificates else {tbl}.certificates end, "
            f"college = coalesce(excluded.college, {tbl}.college), "
            f"course = coalesce(excluded.course, {tbl}.course), updated_at = now()"
        )
    else:
        update = (
            "education = excluded.education, edubridge_training = excluded.edubridge_training, "
            "certificates = excluded.certificates, college = excluded.college, "
            "course = excluded.course, updated_at = now()"
        )
    await db.execute(text(
        f"""insert into {tbl}
              (user_id, education, edubridge_training, certificates, college, course)
            values (:uid, cast(:education as jsonb), cast(:training as jsonb),
                    cast(:certs as jsonb), :college, :course)
            on conflict (user_id) do update set {update}"""
    ), {
        "uid": str(user_id),
        "education": json.dumps(data.get("education") or []),
        "training": json.dumps(data.get("edubridge_training") or []),
        "certs": json.dumps(data.get("certificates") or []),
        "college": data.get("college"),
        "course": data.get("course"),
    })


async def ingest_by_email(db: AsyncSession, record: dict) -> dict:
    """Resolve the learner by email and upsert their record.

    Returns {email, matched, user_id}. `matched` is False when no profile exists
    yet for that email (the learner hasn't signed in through a portal).
    """
    email = (record.get("email") or "").strip()
    uid = await resolve_user_id_by_email(db, email)
    if uid is None:
        return {"email": email, "matched": False, "user_id": None}
    await upsert_career_record(db, uid, record, merge=True)   # multi-source safe
    return {"email": email, "matched": True, "user_id": str(uid)}
