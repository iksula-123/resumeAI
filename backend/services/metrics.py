"""
Success-metric instrumentation (PRD §11 / spec Section 7).

Computes the Phase-1 targets from data we already log — usage_events (tenant-
attributed), ats_reports (per-resume scores) and ai_usage (token cost):

  * resume completion rate   (target 80%+)   builds started → resumes finished
  * time to first resume      (target 2-3 min) median start→first-resume
  * avg ATS improvement       (target +25%)   first vs latest score per resume
  * cost per resume           (AI cost / resume; Sarvam+hosting tracked separately)

Plus a per-tenant usage summary so platform cost is attributable to each deal.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

def _win(col: str = "created_at") -> str:
    return f"{col} >= now() - make_interval(days => :days)"


async def _scalar(db: AsyncSession, sql: str, params: dict):
    return (await db.execute(text(sql), params)).scalar()


async def summary(db: AsyncSession, days: int = 30, tenant_id: str | None = None) -> dict:
    p = {"days": days}
    tclause = ""
    if tenant_id:
        tclause = " and tenant_id = :tid"
        p["tid"] = tenant_id

    builds_started = await _scalar(db, f"select count(*) from public.usage_events where event_type='role_prefill' and {_win()}{tclause}", p) or 0
    resumes_created = await _scalar(db, f"select count(*) from public.usage_events where event_type='resume_created' and {_win()}{tclause}", p) or 0
    role_builds = await _scalar(db, f"select count(*) from public.usage_events where event_type='resume_created' and metadata->>'source'='role_builder' and {_win()}{tclause}", p) or 0
    downloads = await _scalar(db, f"select count(*) from public.usage_events where event_type in ('download_pdf','download_docx') and {_win()}{tclause}", p) or 0

    # completion rate: role-builder resumes finished / build flows started
    completion_rate = round(role_builds / builds_started * 100, 1) if builds_started else None

    # time to first resume (median seconds): per user, first start → first resume_created
    ttfr = await _scalar(db, f"""
        with starts as (select user_id, min(created_at) t from public.usage_events
                        where event_type='role_prefill' and {_win()}{tclause} group by user_id),
             firsts as (select user_id, min(created_at) t from public.usage_events
                        where event_type='resume_created' and {_win()}{tclause} group by user_id)
        select percentile_cont(0.5) within group (order by extract(epoch from firsts.t - starts.t))
        from starts join firsts using (user_id) where firsts.t >= starts.t
    """, p)

    # avg ATS improvement: per resume, first vs latest score (from ats_reports)
    tclause_r = " and r.user_id in (select id from public.profiles where tenant_id = :tid)" if tenant_id else ""
    ats = (await db.execute(text(f"""
        with scored as (
            select resume_id,
                   first_value(score) over (partition by resume_id order by created_at) as first_score,
                   first_value(score) over (partition by resume_id order by created_at desc) as last_score,
                   count(*) over (partition by resume_id) as n
            from public.ats_reports r
            where {_win()}{tclause_r}
        )
        select coalesce(avg(last_score - first_score), 0)::numeric(10,1) as avg_gain,
               count(distinct resume_id) as resumes_measured
        from scored where n >= 2
    """), p)).mappings().first()

    # cost per resume (AI/Gemini token cost from ai_usage; Sarvam+hosting excluded)
    tclause_a = " and user_id in (select id from public.profiles where tenant_id = :tid)" if tenant_id else ""
    ai_cost = await _scalar(db, f"select coalesce(sum(est_cost),0) from public.ai_usage where {_win()}{tclause_a}", p) or 0

    return {
        "window_days": days,
        "tenant_id": tenant_id,
        "builds_started": builds_started,
        "resumes_created": resumes_created,
        "role_builder_resumes": role_builds,
        "downloads": downloads,
        "completion_rate_pct": completion_rate,          # target 80+
        "time_to_first_resume_sec": round(ttfr) if ttfr is not None else None,  # target 120-180
        "avg_ats_improvement": float(ats["avg_gain"]) if ats else 0.0,          # target +25
        "ats_resumes_measured": ats["resumes_measured"] if ats else 0,
        "ai_cost_usd": round(float(ai_cost), 4),
        "cost_per_resume_usd": round(float(ai_cost) / resumes_created, 4) if resumes_created else None,
    }


async def per_tenant_usage(db: AsyncSession, days: int = 30) -> list[dict]:
    """Per-tenant event counts + AI cost — how platform cost attributes to each deal."""
    rows = (await db.execute(text(f"""
        select t.id::text as tenant_id, t.slug, t.name, t.is_active,
               count(u.*) filter (where u.event_type='resume_created') as resumes,
               count(u.*) filter (where u.event_type='role_prefill')   as builds_started,
               count(u.*) filter (where u.event_type in ('download_pdf','download_docx')) as downloads,
               count(u.*) filter (where u.event_type like 'voice_%')   as voice_calls,
               count(u.*) as total_events
        from public.tenants t
        left join public.usage_events u on u.tenant_id = t.id and {_win('u.created_at')}
        group by t.id, t.slug, t.name, t.is_active
        order by total_events desc
    """), {"days": days})).mappings().all()

    # AI cost per tenant (join ai_usage → profiles.tenant_id)
    costs = {r["tid"]: float(r["cost"]) for r in (await db.execute(text(f"""
        select p.tenant_id::text as tid, coalesce(sum(a.est_cost),0) as cost
        from public.ai_usage a join public.profiles p on p.id = a.user_id
        where {_win('a.created_at')} group by p.tenant_id
    """), {"days": days})).mappings().all()}

    out = []
    for r in rows:
        d = dict(r)
        d["ai_cost_usd"] = round(costs.get(d["tenant_id"], 0.0), 4)
        out.append(d)
    return out
