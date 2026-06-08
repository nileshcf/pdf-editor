"""Annotations and drawing routes: add image, draw shape, add highlight."""
from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

import pdf_engine as engine
from deps import build_edit_response, get_session_or_404, session_manager
from logging_config import get_logger
from schemas import DrawShapeRequest, EditResponse, HighlightRequest

router = APIRouter(prefix="/api", tags=["annotations"])
log = get_logger("routers.annotations")
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/add-image/{session_id}", response_model=EditResponse)
async def add_image(
    session_id: str,
    file: UploadFile = File(...),
    page_number: int = Form(...),
    x: float = Form(...),
    y: float = Form(...),
    width: float = Form(...),
    height: float = Form(...),
):
    get_session_or_404(session_id)
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")
    if width <= 0 or height <= 0:
        raise HTTPException(status_code=400, detail="Image width and height must be greater than zero.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")

    def _mutate(doc):
        engine.insert_image(
            doc,
            page_number,
            image_bytes,
            [x, y, x + width, y + height]
        )

    try:
        session, _ = await run_in_threadpool(session_manager.mutate, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, "Image inserted.")


@router.post("/draw-shape/{session_id}", response_model=EditResponse)
async def draw_shape(session_id: str, req: DrawShapeRequest):
    get_session_or_404(session_id)

    def _mutate(doc):
        engine.draw_shape(
            doc,
            req.page_number,
            req.shape_type,
            req.bbox,
            req.stroke_color,
            req.fill_color,
            req.line_width
        )

    try:
        session, _ = await run_in_threadpool(session_manager.mutate, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, f"Drew {req.shape_type}.")


@router.post("/add-highlight/{session_id}", response_model=EditResponse)
async def add_highlight(session_id: str, req: HighlightRequest):
    get_session_or_404(session_id)

    def _mutate(doc):
        engine.add_highlight(
            doc,
            req.page_number,
            req.bbox,
            req.color
        )

    try:
        session, _ = await run_in_threadpool(session_manager.mutate, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, "Highlight added.")
