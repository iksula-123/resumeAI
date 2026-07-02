import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from project root before any module reads os.getenv()
_env_file = Path(__file__).parent.parent / ".env.local"
if _env_file.exists():
    load_dotenv(_env_file, override=True)
else:
    load_dotenv(override=True)

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, DATABASE_URL, IS_SQLITE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    backend = "SQLite (local file)" if IS_SQLITE else "PostgreSQL"
    try:
        await init_db()
        logger.info("Database ready — using %s", backend)
    except Exception as exc:
        logger.error("Database init failed (%s): %s", backend, exc)
    yield


app = FastAPI(
    title="ResumeAI Pro API",
    description="AI-powered resume builder SaaS",
    version="1.0.0",
    lifespan=lifespan,
)

# Allowed browser origins. Local dev defaults + any set via CORS_ORIGINS
# (comma-separated), e.g. your Vercel URL "https://your-app.vercel.app".
_default_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
_env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _env_origins,
    # Also allow any Vercel preview/prod domain for this project
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# TEMP DEBUG: surface unhandled errors in the response so we can diagnose the
# production 500 without digging through logs. Remove after fixing.
@app.exception_handler(Exception)
async def _debug_unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error_type": type(exc).__name__, "detail": str(exc)[:800]},
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/")
async def root():
    return {"message": "ResumeAI Pro API", "docs": "/docs"}


def _try_include(module_name: str):
    try:
        from importlib import import_module
        mod = import_module(f"routers.{module_name}")
        app.include_router(mod.router)
        logger.info("Router loaded: %s", module_name)
    except Exception as exc:
        logger.warning("Router not loaded: %s — %s", module_name, exc)


_try_include("auth")
_try_include("admin")
_try_include("resumes")
_try_include("cover_letters")
_try_include("ai")
_try_include("ats")
_try_include("export")
_try_include("billing")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
