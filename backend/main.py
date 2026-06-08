"""
AeroPDF backend — FastAPI application assembly.

Routes live in ``routers/``; PDF logic in ``pdf_engine.py``; session/version
state in ``sessions.py``.  This module only wires middleware, lifespan and
error handling together.
"""
from __future__ import annotations

import asyncio
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from deps import session_manager
from logging_config import configure_logging, get_logger
from routers import documents, editing, pages

configure_logging()
log = get_logger("main")

_PURGE_INTERVAL_SECONDS = 3600


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AeroPDF backend starting (temp_dir=%s)", settings.temp_dir)
    stop = asyncio.Event()

    async def _purge_loop():
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=_PURGE_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                removed = session_manager.purge_expired()
                if removed:
                    log.info("Purged %d expired session(s)", removed)

    task = asyncio.create_task(_purge_loop())
    try:
        yield
    finally:
        stop.set()
        task.cancel()
        if settings.cleanup_on_shutdown:
            shutil.rmtree(settings.temp_dir, ignore_errors=True)
            log.info("Cleaned up temp dir on shutdown")


app = FastAPI(title="AeroPDF Backend", version="2.0.0", lifespan=lifespan)

_origins = settings.cors_origins   # parsed list from comma-separated env var
_allow_all = "*" in _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins,
    allow_credentials=not _allow_all,  # credentials + wildcard origin is invalid
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"success": False, "detail": "Internal server error."})


@app.get("/api/health", tags=["meta"])
async def health():
    return {"status": "ok", "version": app.version}


app.include_router(documents.router)
app.include_router(editing.router)
app.include_router(pages.router)
