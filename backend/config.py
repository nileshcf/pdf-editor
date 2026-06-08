"""
Central application configuration.

All tunables live here and can be overridden via environment variables
(prefix ``AEROPDF_``) so the same image runs unchanged across dev / staging /
prod.  Example::

    AEROPDF_MAX_FILE_MB=100 AEROPDF_ALLOWED_ORIGINS="https://app.example.com"
    AEROPDF_ALLOWED_ORIGINS="https://foo.vercel.app,https://bar.vercel.app"
"""
from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_temp_dir() -> str:
    """Pick a writable session-storage root."""
    return os.path.join(tempfile.gettempdir(), "aeropdf_sessions")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AEROPDF_",
        env_file=".env",
        extra="ignore",
    )

    # --- Storage -----------------------------------------------------------
    temp_dir: str = Field(default_factory=_default_temp_dir)

    # --- Upload limits -----------------------------------------------------
    max_file_mb: int = 50
    max_pages: int = 2000

    # --- Sessions ----------------------------------------------------------
    session_ttl_hours: int = 24
    max_history_versions: int = 50
    cleanup_on_shutdown: bool = False

    # --- Security ----------------------------------------------------------
    # Plain comma-separated string — stored as str so pydantic-settings never
    # tries to JSON-decode it.  "*" allows all origins (dev only).
    # e.g. AEROPDF_ALLOWED_ORIGINS=https://proeditorfree.vercel.app
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Logging -----------------------------------------------------------
    log_level: str = "INFO"
    json_logs: bool = False

    # --- Derived -----------------------------------------------------------
    @property
    def cors_origins(self) -> List[str]:
        """Parsed list of allowed origins from the comma-separated env var."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
