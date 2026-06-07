"""Shared singletons and helpers used across routers."""
from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException

from schemas import EditResponse, HistoryState
from sessions import Session, SessionError, SessionManager

# Single process-wide manager (loads any persisted sessions on construction).
session_manager = SessionManager()


def get_session_or_404(session_id: str) -> Session:
    try:
        return session_manager.get(session_id)
    except SessionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def build_edit_response(
    session: Session,
    message: str = "",
    replacements_made: Optional[int] = None,
    warnings: Optional[List[str]] = None,
) -> EditResponse:
    data = session_manager.extract(session.session_id)
    return EditResponse(
        message=message,
        pages=data["pages"],
        metadata=data["metadata"],
        history=HistoryState(**session.history_state()),
        replacements_made=replacements_made,
        warnings=warnings or [],
    )
