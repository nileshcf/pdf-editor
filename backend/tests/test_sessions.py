"""Tests for SessionManager: versioning, undo/redo, persistence."""
from __future__ import annotations

import os
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings  # noqa: E402
import pdf_engine as engine  # noqa: E402
from sessions import SessionError, SessionManager  # noqa: E402


def _pdf_bytes(text="Draft") -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=200, height=200)
    page.insert_text((20, 100), text, fontsize=14, fontname="helv")
    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture
def manager(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "temp_dir", str(tmp_path))
    return SessionManager()


def test_create_and_extract(manager):
    sess = manager.create(_pdf_bytes(), "doc.pdf")
    data = manager.extract(sess.session_id)
    assert data["metadata"]["pages"] == 1
    assert sess.can_undo is False and sess.can_redo is False


def test_mutate_creates_version_and_enables_undo(manager):
    sess = manager.create(_pdf_bytes("Draft"), "doc.pdf")
    manager.mutate(sess.session_id, lambda doc: engine.replace_text(doc, "Draft", "Final"))
    assert sess.can_undo is True
    assert "Final" in manager.extract(sess.session_id)["pages"][0]["blocks"][0]["lines"][0]["spans"][0]["text"]


def test_undo_redo_roundtrip(manager):
    sess = manager.create(_pdf_bytes("Draft"), "doc.pdf")
    manager.mutate(sess.session_id, lambda doc: engine.replace_text(doc, "Draft", "Final"))

    manager.undo(sess.session_id)
    assert sess.can_undo is False and sess.can_redo is True

    manager.redo(sess.session_id)
    assert sess.can_undo is True and sess.can_redo is False

    with pytest.raises(SessionError):
        manager.redo(sess.session_id)


def test_new_edit_forks_history(manager):
    sess = manager.create(_pdf_bytes("Draft"), "doc.pdf")
    manager.mutate(sess.session_id, lambda doc: engine.replace_text(doc, "Draft", "First"))
    manager.undo(sess.session_id)
    manager.mutate(sess.session_id, lambda doc: engine.replace_text(doc, "Draft", "Second"))
    assert sess.can_redo is False  # the "First" branch was discarded


def test_persistence_survives_new_manager(manager, tmp_path, monkeypatch):
    sess = manager.create(_pdf_bytes("Draft"), "doc.pdf")
    manager.mutate(sess.session_id, lambda doc: engine.replace_text(doc, "Draft", "Final"))
    sid = sess.session_id

    monkeypatch.setattr(settings, "temp_dir", str(tmp_path))
    reborn = SessionManager()
    restored = reborn.get(sid)
    assert restored.can_undo is True
    assert restored.filename == "doc.pdf"


def test_missing_session_raises(manager):
    with pytest.raises(SessionError):
        manager.get("nope")
