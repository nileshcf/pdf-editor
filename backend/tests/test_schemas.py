from __future__ import annotations

import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas import DrawShapeRequest, PersistOCRRequest  # noqa: E402


def test_draw_shape_bbox_must_be_valid_rect():
    with pytest.raises(ValidationError):
        DrawShapeRequest(
            page_number=1,
            shape_type="rect",
            bbox=[10, 10, 10, 12],
            stroke_color="#000000",
            fill_color="#ffffff",
            line_width=2,
        )


def test_persist_ocr_requires_non_empty_blocks():
    with pytest.raises(ValidationError):
        PersistOCRRequest(page_number=1, blocks=[])
