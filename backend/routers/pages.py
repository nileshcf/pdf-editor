"""Page-level structural operations: rotate, delete, reorder, duplicate, insert."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

import pdf_engine as engine
from deps import build_edit_response, get_session_or_404, session_manager
from schemas import (
    DeletePagesRequest,
    DuplicatePageRequest,
    EditResponse,
    InsertBlankRequest,
    ReorderRequest,
    RotateRequest,
)

router = APIRouter(prefix="/api/pages", tags=["pages"])


async def _run(session_id: str, mutate, message: str) -> EditResponse:
    get_session_or_404(session_id)
    try:
        session, _ = await run_in_threadpool(session_manager.mutate, session_id, mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, message)


@router.post("/rotate/{session_id}", response_model=EditResponse)
async def rotate(session_id: str, req: RotateRequest):
    return await _run(
        session_id,
        lambda doc: engine.rotate_pages(doc, req.page_numbers, req.degrees),
        f"Rotated by {req.degrees}°.",
    )


@router.post("/delete/{session_id}", response_model=EditResponse)
async def delete(session_id: str, req: DeletePagesRequest):
    return await _run(
        session_id,
        lambda doc: engine.delete_pages(doc, req.page_numbers),
        f"Deleted {len(req.page_numbers)} page(s).",
    )


@router.post("/reorder/{session_id}", response_model=EditResponse)
async def reorder(session_id: str, req: ReorderRequest):
    return await _run(session_id, lambda doc: engine.reorder_pages(doc, req.order), "Pages reordered.")


@router.post("/duplicate/{session_id}", response_model=EditResponse)
async def duplicate(session_id: str, req: DuplicatePageRequest):
    return await _run(
        session_id,
        lambda doc: engine.duplicate_page(doc, req.page_number),
        f"Duplicated page {req.page_number}.",
    )


@router.post("/insert-blank/{session_id}", response_model=EditResponse)
async def insert_blank(session_id: str, req: InsertBlankRequest):
    return await _run(
        session_id,
        lambda doc: engine.insert_blank_page(doc, req.after_page, req.width, req.height),
        "Inserted blank page.",
    )
