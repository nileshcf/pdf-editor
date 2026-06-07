"""
A small, dependency-free command interpreter for the header command bar.

Each pattern parses into a callable that mutates an open ``fitz.Document`` and
returns a human-readable result string.  Unknown input raises
:class:`CommandError` listing what *is* supported.
"""
from __future__ import annotations

import re
from typing import Callable, List

import fitz

import pdf_engine as engine

# A mutator takes the open doc and returns a status message.
Mutator = Callable[["fitz.Document"], str]

_QUOTE = r"[\"'“”‘’]"


class CommandError(ValueError):
    pass


def _parse_page_spec(spec: str) -> List[int]:
    """'2', '2-4', '1,3,5' -> sorted unique 1-based page list."""
    pages: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            pages.update(range(int(a), int(b) + 1))
        elif part:
            pages.add(int(part))
    return sorted(pages)


def interpret(command: str) -> Mutator:
    cmd = command.strip()

    # replace "x" with "y" [on page N]
    m = re.match(
        rf'replace\s+{_QUOTE}(.*?){_QUOTE}\s+with\s+{_QUOTE}(.*?){_QUOTE}'
        r'(?:\s+on\s+page\s+(\d+))?$',
        cmd,
        re.IGNORECASE,
    )
    if m:
        search, repl, page = m.group(1), m.group(2), m.group(3)
        page_no = int(page) if page else None

        def _do(doc: "fitz.Document") -> str:
            n = engine.replace_text(doc, search, repl, page_number=page_no)
            scope = f"on page {page_no}" if page_no else "across all pages"
            return f"Replaced {n} instance{'s' if n != 1 else ''} of '{search}' {scope}."

        return _do

    # delete page(s) N[-M][,K]
    m = re.match(r'(?:delete|remove)\s+pages?\s+([\d,\- ]+)$', cmd, re.IGNORECASE)
    if m:
        pages = _parse_page_spec(m.group(1))

        def _do(doc: "fitz.Document") -> str:
            engine.delete_pages(doc, pages)
            return f"Deleted page{'s' if len(pages) != 1 else ''} {', '.join(map(str, pages))}."

        return _do

    # rotate page N left|right|180   |   rotate all right
    m = re.match(
        r'rotate\s+(?:page\s+(\d+)|(all|pages?))\s*(left|right|180|clockwise|counterclockwise)?$',
        cmd,
        re.IGNORECASE,
    )
    if m:
        page = int(m.group(1)) if m.group(1) else None
        direction = (m.group(3) or "right").lower()
        degrees = {"left": -90, "counterclockwise": -90, "right": 90, "clockwise": 90, "180": 180}[direction]

        def _do(doc: "fitz.Document") -> str:
            engine.rotate_pages(doc, [page] if page else None, degrees)
            where = f"page {page}" if page else "all pages"
            return f"Rotated {where} by {degrees}°."

        return _do

    # duplicate page N
    m = re.match(r'duplicate\s+page\s+(\d+)$', cmd, re.IGNORECASE)
    if m:
        page = int(m.group(1))

        def _do(doc: "fitz.Document") -> str:
            engine.duplicate_page(doc, page)
            return f"Duplicated page {page}."

        return _do

    # insert blank page [after page N]
    m = re.match(r'(?:insert|add)\s+(?:blank\s+)?page(?:\s+after\s+page\s+(\d+))?$', cmd, re.IGNORECASE)
    if m:
        after = int(m.group(1)) if m.group(1) else None

        def _do(doc: "fitz.Document") -> str:
            pos = after if after is not None else doc.page_count
            engine.insert_blank_page(doc, pos, None, None)
            return f"Inserted a blank page after page {pos}." if pos else "Inserted a blank page at the start."

        return _do

    raise CommandError(
        "Command not recognised. Try: "
        'replace "a" with "b" [on page N] · delete page N · '
        "rotate page N left|right · duplicate page N · insert page after page N"
    )
