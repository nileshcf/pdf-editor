"""Editable overlay object routes."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List

import fitz
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from deps import build_edit_response, get_session_or_404, session_manager
from schemas import (
    EditResponse,
    EditorObjectCreateRequest,
    EditorObjectUpdateRequest,
    ObjectReorderRequest,
)

router = APIRouter(prefix="/api", tags=["objects"])


def _validate_object_bounds(session_id: str, page_number: int, bbox: List[float], allow_line: bool = False) -> None:
    session = session_manager.get(session_id)
    doc = fitz.open(session.current_path)
    try:
        if not 1 <= page_number <= doc.page_count:
            raise IndexError("Page number out of bounds")
        page = doc[page_number - 1]
        rect = fitz.Rect(bbox)
        if allow_line:
            if rect.x0 == rect.x1 and rect.y0 == rect.y1:
                raise ValueError("Object bbox must span a visible area or line")
        elif rect.width <= 0 or rect.height <= 0:
            raise ValueError("Object bbox must have positive width and height")
        if rect.x0 < page.rect.x0 or rect.y0 < page.rect.y0 or rect.x1 > page.rect.x1 or rect.y1 > page.rect.y1:
            raise ValueError("Object bbox is outside page bounds")
    finally:
        doc.close()


def _find_object(objects: List[Dict[str, Any]], object_id: str) -> int:
    for idx, obj in enumerate(objects):
        if obj.get("id") == object_id:
            return idx
    raise ValueError("Object not found")


@router.post("/objects/{session_id}", response_model=EditResponse)
async def create_object(session_id: str, req: EditorObjectCreateRequest):
    get_session_or_404(session_id)

    def _mutate(objects: List[Dict[str, Any]]):
        _validate_object_bounds(
            session_id,
            req.page_number,
            req.bbox,
            allow_line=req.type == "shape" and req.shape_type in {"line", "arrow"},
        )
        obj = req.model_dump(exclude_none=True)
        obj["id"] = uuid.uuid4().hex
        obj["z_index"] = max((int(item.get("z_index", 0)) for item in objects), default=-1) + 1
        objects.append(obj)
        return obj

    try:
        session, created = await run_in_threadpool(session_manager.mutate_objects, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, f"Added {created['type']}.")


@router.patch("/objects/{session_id}/{object_id}", response_model=EditResponse)
async def update_object(session_id: str, object_id: str, req: EditorObjectUpdateRequest):
    get_session_or_404(session_id)

    def _mutate(objects: List[Dict[str, Any]]):
        idx = _find_object(objects, object_id)
        current = dict(objects[idx])
        merged = {**current, **req.model_dump(exclude_none=True)}
        candidate = EditorObjectCreateRequest(**merged).model_dump(exclude_none=True)
        candidate["id"] = object_id
        _validate_object_bounds(
            session_id,
            candidate["page_number"],
            candidate["bbox"],
            allow_line=candidate["type"] == "shape" and candidate.get("shape_type") in {"line", "arrow"},
        )
        objects[idx] = candidate
        return candidate

    try:
        session, updated = await run_in_threadpool(session_manager.mutate_objects, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, f"Updated {updated['type']}.")


@router.delete("/objects/{session_id}/{object_id}", response_model=EditResponse)
async def delete_object(session_id: str, object_id: str):
    get_session_or_404(session_id)

    def _mutate(objects: List[Dict[str, Any]]):
        idx = _find_object(objects, object_id)
        deleted = objects[idx]
        del objects[idx]
        return deleted

    try:
        session, deleted = await run_in_threadpool(session_manager.mutate_objects, session_id, _mutate)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, f"Deleted {deleted['type']}.")


@router.post("/objects/{session_id}/reorder", response_model=EditResponse)
async def reorder_objects(session_id: str, req: ObjectReorderRequest):
    get_session_or_404(session_id)

    def _mutate(objects: List[Dict[str, Any]]):
        known = {obj["id"] for obj in objects}
        missing = [oid for oid in req.object_ids if oid not in known]
        if missing:
            raise ValueError("One or more objects do not exist")
        order = {oid: idx for idx, oid in enumerate(req.object_ids)}
        objects.sort(key=lambda item: (order.get(item["id"], len(order) + int(item.get("z_index", 0))), int(item.get("z_index", 0))))
        for idx, obj in enumerate(objects):
            obj["z_index"] = idx
        return None

    try:
        session, _ = await run_in_threadpool(session_manager.mutate_objects, session_id, _mutate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, "Reordered objects.")


@router.post("/flatten/{session_id}", response_model=EditResponse)
async def flatten(session_id: str):
    get_session_or_404(session_id)
    try:
        session = await run_in_threadpool(session_manager.flatten, session_id)
    except (IndexError, ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, "Flattened editor objects into the PDF.")


@router.get("/assets/{session_id}/{asset_id}")
async def get_asset(session_id: str, asset_id: str):
    get_session_or_404(session_id)
    try:
        path = await run_in_threadpool(session_manager.asset_path, session_id, asset_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path, headers={"Cache-Control": "no-store"})
