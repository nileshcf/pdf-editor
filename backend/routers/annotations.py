"""Annotations and drawing routes: add image, draw shape, add highlight."""
from __future__ import annotations

import uuid

import fitz
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

import pdf_engine as engine
from deps import build_edit_response, get_session_or_404, session_manager
from logging_config import get_logger
from schemas import DrawShapeRequest, EditResponse, HighlightRequest

router = APIRouter(prefix="/api", tags=["annotations"])
log = get_logger("routers.annotations")
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _validate_bbox(session_id: str, page_number: int, bbox: list[float], allow_line: bool = False) -> None:
    session = session_manager.get(session_id)
    doc = fitz.open(session.current_path)
    try:
        if not 1 <= page_number <= doc.page_count:
            raise IndexError("Page number out of bounds")
        page = doc[page_number - 1]
        # Lines/arrows keep their direction in the bbox (start -> end), so
        # normalise before comparing against the page rectangle.
        x0, y0, x1, y1 = (float(v) for v in bbox)
        norm = fitz.Rect(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
        if allow_line:
            if x0 == x1 and y0 == y1:
                raise ValueError("Shape bbox must span a visible area or line")
        elif norm.width <= 0 or norm.height <= 0:
            raise ValueError("Shape bbox must have positive width and height")
        if norm.x0 < page.rect.x0 or norm.y0 < page.rect.y0 or norm.x1 > page.rect.x1 or norm.y1 > page.rect.y1:
            raise ValueError("Object bbox is outside page bounds")
    finally:
        doc.close()


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

    bbox = [x, y, x + width, y + height]

    def _mutate(objects):
        _validate_bbox(session_id, page_number, bbox)
        asset_id = session_manager.store_asset(session_id, file.filename or "image", image_bytes)
        z_index = max((int(item.get("z_index", 0)) for item in objects), default=-1) + 1
        objects.append(
            {
                "id": uuid.uuid4().hex,
                "page_number": page_number,
                "type": "image",
                "bbox": bbox,
                "rotation": 0.0,
                "opacity": 1.0,
                "z_index": z_index,
                "locked": False,
                "hidden": False,
                "asset_id": asset_id,
            }
        )

    try:
        session, _ = await run_in_threadpool(session_manager.mutate_objects, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, "Image added as editable object.")


@router.post("/draw-shape/{session_id}", response_model=EditResponse)
async def draw_shape(session_id: str, req: DrawShapeRequest):
    get_session_or_404(session_id)

    def _mutate(objects):
        _validate_bbox(session_id, req.page_number, req.bbox, allow_line=req.shape_type in {"line", "arrow"})
        z_index = max((int(item.get("z_index", 0)) for item in objects), default=-1) + 1
        objects.append(
            {
                "id": uuid.uuid4().hex,
                "page_number": req.page_number,
                "type": "shape",
                "bbox": req.bbox,
                "rotation": 0.0,
                "opacity": 1.0,
                "z_index": z_index,
                "locked": False,
                "hidden": False,
                "shape_type": req.shape_type,
                "stroke_color": req.stroke_color,
                "fill_color": req.fill_color,
                "line_width": req.line_width,
            }
        )

    try:
        session, _ = await run_in_threadpool(session_manager.mutate_objects, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, f"Added {req.shape_type} object.")


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
