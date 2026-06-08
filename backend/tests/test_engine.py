"""
Unit tests for the PDF engine and session manager.

Run from the backend directory:  ``python -m pytest``
"""
from __future__ import annotations

import os
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdf_engine as engine  # noqa: E402


def _make_pdf(text: str = "Hello Draft world", size: float = 12.0) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=300, height=200)
    page.insert_text((50, 100), text, fontsize=size, fontname="helv")
    data = doc.tobytes()
    doc.close()
    return data


def _open(data: bytes) -> "fitz.Document":
    return fitz.open(stream=data, filetype="pdf")


# --------------------------------------------------------------------------- #
#  Font resolution
# --------------------------------------------------------------------------- #
def test_font_flags_take_priority():
    # Bold flag set even though name has no "bold".
    assert engine.resolve_pdf_font("CustomSans", flags=1 << 4) == "hebo"
    assert engine.resolve_pdf_font("Times New Roman") == "times"
    assert engine.resolve_pdf_font("Courier", flags=(1 << 4) | (1 << 1)) == "cobi"


def test_hex_roundtrip():
    assert engine.hex_to_rgb01("#ffffff") == (1.0, 1.0, 1.0)
    assert engine._int_to_hex(0x000000) == "#000000"


# --------------------------------------------------------------------------- #
#  Extraction
# --------------------------------------------------------------------------- #
def test_extract_reports_geometry_and_spans():
    doc = _open(_make_pdf())
    data = engine.extract_pdf_data(doc)
    assert data["metadata"]["pages"] == 1
    page = data["pages"][0]
    assert page["width"] == 300 and page["height"] == 200
    assert page["is_scanned"] is False
    spans = page["blocks"][0]["lines"][0]["spans"]
    assert any("Draft" in s["text"] for s in spans)
    assert "origin" in spans[0]
    doc.close()


# --------------------------------------------------------------------------- #
#  Replace
# --------------------------------------------------------------------------- #
def test_replace_changes_text_and_counts():
    doc = _open(_make_pdf("The Draft is a Draft"))
    n = engine.replace_text(doc, "Draft", "Final")
    assert n == 2
    text = doc[0].get_text()
    assert "Draft" not in text
    assert "Final" in text
    doc.close()


def test_replace_missing_term_is_noop():
    doc = _open(_make_pdf())
    assert engine.replace_text(doc, "Nonexistent", "X") == 0
    doc.close()


def test_replace_out_of_bounds_raises():
    doc = _open(_make_pdf())
    with pytest.raises(IndexError):
        engine.replace_text(doc, "Draft", "X", page_number=99)
    doc.close()


# --------------------------------------------------------------------------- #
#  Block edit overflow safety
# --------------------------------------------------------------------------- #
def test_edit_block_autoshrinks_long_text():
    doc = _open(_make_pdf())
    long_text = "word " * 200
    warnings = engine.edit_block(
        doc, 1, [50, 90, 120, 110], long_text, font_size=12, font_name="Helvetica", hex_color="#000000"
    )
    # Should either fit after shrinking or warn — never raise.
    assert isinstance(warnings, list)
    doc.close()


def test_edit_block_replaces_content():
    doc = _open(_make_pdf("Original text here"))
    engine.edit_block(doc, 1, [40, 88, 260, 112], "Brand new content", 12, "Helvetica", "#112233")
    assert "Original" not in doc[0].get_text()
    assert "Brand" in doc[0].get_text()
    doc.close()


# --------------------------------------------------------------------------- #
#  Page operations
# --------------------------------------------------------------------------- #
def test_page_ops():
    doc = fitz.open()
    for _ in range(3):
        doc.new_page(width=200, height=200)
    assert doc.page_count == 3

    engine.rotate_pages(doc, [1], 90)
    assert doc[0].rotation == 90

    engine.duplicate_page(doc, 1)
    assert doc.page_count == 4

    engine.delete_pages(doc, [4])
    assert doc.page_count == 3

    engine.reorder_pages(doc, [3, 2, 1])
    assert doc.page_count == 3

    engine.insert_blank_page(doc, after_page=3, width=None, height=None)
    assert doc.page_count == 4
    doc.close()


def test_cannot_delete_all_pages():
    doc = fitz.open()
    doc.new_page()
    with pytest.raises(ValueError):
        engine.delete_pages(doc, [1])
    doc.close()


def test_reorder_must_be_permutation():
    doc = fitz.open()
    doc.new_page()
    doc.new_page()
    with pytest.raises(ValueError):
        engine.reorder_pages(doc, [1, 1])
    doc.close()


def test_insert_ocr_blocks_adds_text():
    doc = fitz.open()
    doc.new_page(width=300, height=200)
    warnings = engine.insert_ocr_blocks(
        doc,
        1,
        [
            {
                "text": "Scanned OCR Text",
                "bbox": [20, 20, 250, 60],
                "font_name": "Helvetica",
                "font_size": 12,
                "hex_color": "#000000",
            }
        ],
    )
    assert warnings == []
    assert "Scanned OCR Text" in doc[0].get_text()
    doc.close()


def test_insert_ocr_blocks_rejects_out_of_bounds():
    doc = fitz.open()
    doc.new_page(width=200, height=200)
    with pytest.raises(ValueError):
        engine.insert_ocr_blocks(
            doc,
            1,
            [{"text": "Bad", "bbox": [0, 0, 260, 40]}],
        )
    doc.close()


def test_insert_image_rejects_outside_page():
    doc = fitz.open()
    doc.new_page(width=200, height=200)
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc`\x00\x00"
        b"\x00\x02\x00\x01\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    with pytest.raises(ValueError):
        engine.insert_image(doc, 1, png, [180, 180, 260, 260])
    doc.close()
