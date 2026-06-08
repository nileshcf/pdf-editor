"""Pydantic request/response models — the API contract in one place."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

HEX_RE = r"^#?[0-9a-fA-F]{6}$"


def _validate_rect(v: List[float]) -> List[float]:
    x0, y0, x1, y1 = v
    if x1 <= x0 or y1 <= y0:
        raise ValueError("bbox must satisfy x1 > x0 and y1 > y0")
    return v


# --------------------------------------------------------------------------- #
#  Requests
# --------------------------------------------------------------------------- #
class ReplaceRequest(BaseModel):
    search_term: str = Field(min_length=1)
    replacement: str = ""
    page_number: Optional[int] = Field(default=None, ge=1)
    case_sensitive: bool = False
    whole_word: bool = False


class EditBlockRequest(BaseModel):
    page_number: int = Field(ge=1)
    original_bbox: List[float] = Field(min_length=4, max_length=4)
    new_text: str = ""
    font_size: float = Field(default=12.0, gt=0, le=400)
    font_name: str = "Helvetica"
    hex_color: str = Field(default="#000000", pattern=HEX_RE)
    align: int = Field(default=0, ge=0, le=3)  # 0 left, 1 center, 2 right, 3 justify
    auto_shrink: bool = True

    @field_validator("original_bbox")
    @classmethod
    def _valid_rect(cls, v: List[float]) -> List[float]:
        return _validate_rect(v)


class CommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=2000)


class RotateRequest(BaseModel):
    page_numbers: Optional[List[int]] = None  # None => all pages
    degrees: int = 90

    @field_validator("degrees")
    @classmethod
    def _quarter_turn(cls, v: int) -> int:
        if v % 90 != 0:
            raise ValueError("degrees must be a multiple of 90")
        return v % 360


class DeletePagesRequest(BaseModel):
    page_numbers: List[int] = Field(min_length=1)


class ReorderRequest(BaseModel):
    # New 1-based ordering, a permutation of all existing pages.
    order: List[int] = Field(min_length=1)


class DuplicatePageRequest(BaseModel):
    page_number: int = Field(ge=1)


class InsertBlankRequest(BaseModel):
    after_page: int = Field(ge=0)  # 0 => insert at the very beginning
    width: Optional[float] = None
    height: Optional[float] = None


class DrawShapeRequest(BaseModel):
    page_number: int = Field(ge=1)
    shape_type: str = Field(pattern="^(rect|circle|line|arrow)$")
    bbox: List[float] = Field(min_length=4, max_length=4)
    stroke_color: str = Field(pattern=HEX_RE)
    fill_color: Optional[str] = Field(default=None, pattern=HEX_RE)
    line_width: float = Field(default=1.0, gt=0)

    @field_validator("bbox")
    @classmethod
    def _valid_rect(cls, v: List[float]) -> List[float]:
        return _validate_rect(v)


class HighlightRequest(BaseModel):
    page_number: int = Field(ge=1)
    bbox: List[float] = Field(min_length=4, max_length=4)
    color: str = Field(pattern=HEX_RE)

    @field_validator("bbox")
    @classmethod
    def _valid_rect(cls, v: List[float]) -> List[float]:
        return _validate_rect(v)


class OCRBlockRequest(BaseModel):
    text: str = Field(min_length=1)
    bbox: List[float] = Field(min_length=4, max_length=4)
    font_name: str = "Helvetica"
    font_size: float = Field(default=12.0, gt=0, le=400)
    hex_color: str = Field(default="#000000", pattern=HEX_RE)
    auto_shrink: bool = True

    @field_validator("bbox")
    @classmethod
    def _valid_rect(cls, v: List[float]) -> List[float]:
        return _validate_rect(v)


class PersistOCRRequest(BaseModel):
    page_number: int = Field(ge=1)
    blocks: List[OCRBlockRequest] = Field(min_length=1)


# --------------------------------------------------------------------------- #
#  Responses
# --------------------------------------------------------------------------- #
class HistoryState(BaseModel):
    can_undo: bool
    can_redo: bool
    version: int
    total_versions: int


class EditResponse(BaseModel):
    success: bool = True
    message: str = ""
    pages: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    history: HistoryState
    replacements_made: Optional[int] = None
    warnings: List[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    session_id: str
    filename: str
    metadata: Dict[str, Any]
    pages: List[Dict[str, Any]]
    history: HistoryState
