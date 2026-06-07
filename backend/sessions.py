"""
Session & version management.

A *session* owns a directory on disk holding the uploaded PDF plus a stack of
version snapshots.  Every mutating edit is applied to the current version and
saved as a **new** snapshot, which makes undo/redo a simple index move and
guarantees a crash never leaves a half-written document as "current".

Concurrency: each session carries its own ``threading.Lock`` so two requests for
the same document can't corrupt its content stream; PyMuPDF work runs in a
thread-pool (see routers), so plain threading locks are the right primitive.

Durability: a ``manifest.json`` per session means sessions (and their full undo
history) survive a server restart — fixing the original in-memory-only design.
"""
from __future__ import annotations

import json
import os
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import fitz

from config import settings
from logging_config import get_logger
from pdf_engine import extract_pdf_data

log = get_logger("sessions")

MANIFEST = "manifest.json"
VERSIONS_DIR = "versions"


@dataclass
class Session:
    session_id: str
    filename: str
    directory: str
    versions: List[str] = field(default_factory=list)  # absolute paths, oldest -> newest
    index: int = 0
    created: float = field(default_factory=lambda: 0.0)
    updated: float = field(default_factory=lambda: 0.0)
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def current_path(self) -> str:
        return self.versions[self.index]

    @property
    def can_undo(self) -> bool:
        return self.index > 0

    @property
    def can_redo(self) -> bool:
        return self.index < len(self.versions) - 1

    def history_state(self) -> Dict[str, object]:
        return {
            "can_undo": self.can_undo,
            "can_redo": self.can_redo,
            "version": self.index,
            "total_versions": len(self.versions),
        }

    # -- persistence -------------------------------------------------------- #
    def _manifest_path(self) -> str:
        return os.path.join(self.directory, MANIFEST)

    def save_manifest(self) -> None:
        data = {
            "session_id": self.session_id,
            "filename": self.filename,
            "versions": [os.path.basename(v) for v in self.versions],
            "index": self.index,
            "created": self.created,
            "updated": self.updated,
        }
        tmp = self._manifest_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        os.replace(tmp, self._manifest_path())  # atomic on POSIX & Windows


class SessionError(Exception):
    """Raised for missing sessions or invalid history moves."""


class SessionManager:
    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._sessions: Dict[str, Session] = {}
        self._global_lock = threading.Lock()
        self._now = now
        os.makedirs(settings.temp_dir, exist_ok=True)
        self._load_existing()

    # ------------------------------------------------------------------ #
    #  Lifecycle
    # ------------------------------------------------------------------ #
    def _load_existing(self) -> None:
        for name in os.listdir(settings.temp_dir):
            directory = os.path.join(settings.temp_dir, name)
            manifest = os.path.join(directory, MANIFEST)
            if not os.path.isfile(manifest):
                continue
            try:
                with open(manifest, encoding="utf-8") as fh:
                    data = json.load(fh)
                vdir = os.path.join(directory, VERSIONS_DIR)
                versions = [os.path.join(vdir, v) for v in data["versions"]]
                if not all(os.path.isfile(v) for v in versions):
                    raise FileNotFoundError("missing version file")
                self._sessions[data["session_id"]] = Session(
                    session_id=data["session_id"],
                    filename=data["filename"],
                    directory=directory,
                    versions=versions,
                    index=data["index"],
                    created=data.get("created", self._now()),
                    updated=data.get("updated", self._now()),
                )
            except Exception as exc:
                log.warning("Skipping unreadable session dir %s: %s", name, exc)
        self.purge_expired()
        log.info("Loaded %d persisted session(s)", len(self._sessions))

    def create(self, file_bytes: bytes, filename: str) -> Session:
        session_id = str(uuid.uuid4())
        directory = os.path.join(settings.temp_dir, session_id)
        vdir = os.path.join(directory, VERSIONS_DIR)
        os.makedirs(vdir, exist_ok=True)

        v0 = os.path.join(vdir, "0000.pdf")
        with open(v0, "wb") as fh:
            fh.write(file_bytes)

        now = self._now()
        sess = Session(
            session_id=session_id,
            filename=filename,
            directory=directory,
            versions=[v0],
            index=0,
            created=now,
            updated=now,
        )
        sess.save_manifest()
        with self._global_lock:
            self._sessions[session_id] = sess
        return sess

    def get(self, session_id: str) -> Session:
        sess = self._sessions.get(session_id)
        if sess is None:
            raise SessionError("Session not found")
        return sess

    def delete(self, session_id: str) -> None:
        with self._global_lock:
            sess = self._sessions.pop(session_id, None)
        if sess and os.path.isdir(sess.directory):
            shutil.rmtree(sess.directory, ignore_errors=True)

    # ------------------------------------------------------------------ #
    #  Edits & history
    # ------------------------------------------------------------------ #
    def mutate(self, session_id: str, mutator: Callable[["fitz.Document"], object]) -> Tuple[Session, object]:
        """Open current version, run ``mutator(doc)``, save the result as a new
        version, and advance the history pointer.  Returns ``(session, result)``.

        The mutator may raise — in that case nothing is committed.
        """
        sess = self.get(session_id)
        with sess.lock:
            doc = fitz.open(sess.current_path)
            try:
                result = mutator(doc)
                new_path = self._next_version_path(sess)
                doc.save(new_path, garbage=4, deflate=True)
            finally:
                doc.close()
            self._commit_version(sess, new_path)
            return sess, result

    def undo(self, session_id: str) -> Session:
        sess = self.get(session_id)
        with sess.lock:
            if not sess.can_undo:
                raise SessionError("Nothing to undo")
            sess.index -= 1
            sess.updated = self._now()
            sess.save_manifest()
        return sess

    def redo(self, session_id: str) -> Session:
        sess = self.get(session_id)
        with sess.lock:
            if not sess.can_redo:
                raise SessionError("Nothing to redo")
            sess.index += 1
            sess.updated = self._now()
            sess.save_manifest()
        return sess

    def extract(self, session_id: str) -> Dict[str, object]:
        sess = self.get(session_id)
        with sess.lock:
            doc = fitz.open(sess.current_path)
            try:
                return extract_pdf_data(doc)
            finally:
                doc.close()

    # ------------------------------------------------------------------ #
    #  internals
    # ------------------------------------------------------------------ #
    def _next_version_path(self, sess: Session) -> str:
        # next sequential filename (independent of any trimmed redo tail)
        existing = [int(os.path.splitext(os.path.basename(v))[0]) for v in sess.versions]
        n = (max(existing) + 1) if existing else 0
        return os.path.join(sess.directory, VERSIONS_DIR, f"{n:04d}.pdf")

    def _commit_version(self, sess: Session, new_path: str) -> None:
        # Drop any redo tail — a fresh edit forks history.
        for stale in sess.versions[sess.index + 1:]:
            try:
                os.remove(stale)
            except OSError:
                pass
        sess.versions = sess.versions[: sess.index + 1] + [new_path]
        sess.index = len(sess.versions) - 1

        # Enforce history cap by trimming the oldest snapshots.
        overflow = len(sess.versions) - settings.max_history_versions
        if overflow > 0:
            for stale in sess.versions[:overflow]:
                try:
                    os.remove(stale)
                except OSError:
                    pass
            sess.versions = sess.versions[overflow:]
            sess.index -= overflow

        sess.updated = self._now()
        sess.save_manifest()

    def purge_expired(self) -> int:
        ttl = settings.session_ttl_hours * 3600
        cutoff = self._now() - ttl
        expired = [sid for sid, s in self._sessions.items() if s.updated < cutoff]
        for sid in expired:
            log.info("Purging expired session %s", sid)
            self.delete(sid)
        return len(expired)
