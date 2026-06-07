"""Content-editing routes: replace, block edit, NL command, undo, redo."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

import commands
import pdf_engine as engine
from deps import build_edit_response, get_session_or_404, session_manager
from logging_config import get_logger
from schemas import CommandRequest, EditBlockRequest, EditResponse, ReplaceRequest

router = APIRouter(prefix="/api", tags=["editing"])
log = get_logger("routers.editing")


@router.post("/replace/{session_id}", response_model=EditResponse)
async def replace_text(session_id: str, req: ReplaceRequest):
    get_session_or_404(session_id)

    def _mutate(doc):
        return engine.replace_text(
            doc,
            req.search_term,
            req.replacement,
            page_number=req.page_number,
            case_sensitive=req.case_sensitive,
            whole_word=req.whole_word,
        )

    try:
        session, count = await run_in_threadpool(session_manager.mutate, session_id, _mutate)
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    msg = f"Replaced {count} instance{'s' if count != 1 else ''} of '{req.search_term}'."
    return await run_in_threadpool(build_edit_response, session, msg, count, None)


@router.post("/edit-block/{session_id}", response_model=EditResponse)
async def edit_block(session_id: str, req: EditBlockRequest):
    get_session_or_404(session_id)
    warnings_holder: list = []

    def _mutate(doc):
        warnings_holder.extend(
            engine.edit_block(
                doc,
                req.page_number,
                req.original_bbox,
                req.new_text,
                req.font_size,
                req.font_name,
                req.hex_color,
                align=req.align,
                auto_shrink=req.auto_shrink,
            )
        )

    try:
        session, _ = await run_in_threadpool(session_manager.mutate, session_id, _mutate)
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, "Text block updated.", None, warnings_holder)


@router.post("/command/{session_id}", response_model=EditResponse)
async def run_command(session_id: str, req: CommandRequest):
    get_session_or_404(session_id)
    try:
        mutator = commands.interpret(req.command)
    except commands.CommandError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    message_holder: list = []

    def _mutate(doc):
        message_holder.append(mutator(doc))

    try:
        session, _ = await run_in_threadpool(session_manager.mutate, session_id, _mutate)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await run_in_threadpool(build_edit_response, session, message_holder[0] if message_holder else "")


@router.post("/undo/{session_id}", response_model=EditResponse)
async def undo(session_id: str):
    get_session_or_404(session_id)
    from sessions import SessionError

    try:
        session = await run_in_threadpool(session_manager.undo, session_id)
    except SessionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, "Undid last change.")


@router.post("/redo/{session_id}", response_model=EditResponse)
async def redo(session_id: str):
    get_session_or_404(session_id)
    from sessions import SessionError

    try:
        session = await run_in_threadpool(session_manager.redo, session_id)
    except SessionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return await run_in_threadpool(build_edit_response, session, "Redid change.")
