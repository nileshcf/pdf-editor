"""
Central application configuration.

All tunables live here and can be overridden via environment variables
(prefix ``AEROPDF_``) so the same image runs unchanged across dev / staging /
prod.  Example::

    AEROPDF_MAX_FILE_MB=100 AEROPDF_ALLOWED_ORIGINS="https://app.example.com"
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AEROPDF_", env_file=".env", extra="ignore")

    # --- Storage -----------------------------------------------------------
    temp_dir: str = Field(
        default_factory=lambda: os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "temp_docs"
        )
    )

    # --- Upload limits -----------------------------------------------------
    max_file_mb: int = 50
    max_pages: int = 2000

    # --- Sessions ----------------------------------------------------------
    session_ttl_hours: int = 24          # idle sessions older than this are purged
    max_history_versions: int = 50       # undo/redo depth per session
    cleanup_on_shutdown: bool = False    # keep temp dir so sessions survive restarts

    # --- Security ----------------------------------------------------------
    # Comma-separated list in the env var; "*" allows all (dev only).
    allowed_origins: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # --- Logging -----------------------------------------------------------
    log_level: str = "INFO"
    json_logs: bool = False

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
