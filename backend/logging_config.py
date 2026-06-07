"""Structured logging setup.

Call :func:`configure_logging` once at startup.  Every log line carries a
millisecond timestamp, level and logger name; set ``AEROPDF_JSON_LOGS=true`` to
emit machine-parseable JSON for log shippers (Datadog, Loki, CloudWatch...).
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

from config import settings


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        # Attach any structured extras passed via logger.info(..., extra={...}).
        for key, value in record.__dict__.items():
            if key not in logging.LogRecord("", 0, "", 0, "", (), None).__dict__ and key != "message":
                payload[key] = value
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.json_logs:
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s.%(msecs)03d | %(levelname)-7s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())

    # PyMuPDF and uvicorn access logs are noisy; tame them.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
