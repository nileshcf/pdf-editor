import fitz
import os
from typing import Dict, List, Any

def extract_pdf_data(pdf_path: str) -> Dict[str, Any]:
    """
    Parses a PDF file and extracts page dimensions, text blocks, and metadata.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found at {pdf_path}")

    doc = fitz.open(pdf_path)
    result = {
        "metadata": {
            "title": doc.metadata.get("title", ""),
            "author": doc.metadata.get("author", ""),
            "pages": len(doc),
        },
        "pages": []
    }

    for page_index, page in enumerate(doc):
        rect = page.rect
        width = rect.width
        height = rect.height

        text_dict = page.get_text("dict", flags=fitz.TEXTFLAGS_SEARCH)

        blocks = []
        for b in text_dict.get("blocks", []):
            if b.get("type") == 0:  # text block
                block_data = {
                    "bbox": b["bbox"],
                    "lines": []
                }
                for line in b.get("lines", []):
                    line_data = {
                        "bbox": line["bbox"],
                        "spans": []
                    }
                    for span in line.get("spans", []):
                        color_val = span["color"]
                        r = (color_val >> 16) & 255
                        g = (color_val >> 8) & 255
                        b_val = color_val & 255
                        hex_color = f"#{r:02x}{g:02x}{b_val:02x}"
                        line_data["spans"].append({
                            "text": span["text"],
                            "bbox": span["bbox"],
                            "font": span["font"],
                            "size": span["size"],
                            "color": hex_color
                        })
                    block_data["lines"].append(line_data)
                blocks.append(block_data)

        image_list = page.get_images(full=True)
        images = []
        for img in image_list:
            xref = img[0]
            rects = page.get_image_rects(xref)
            bbox = list(rects[0]) if rects else [0, 0, 0, 0]
            images.append({
                "xref": xref,
                "bbox": bbox,
                "width": img[2],
                "height": img[3]
            })

        result["pages"].append({
            "number": page_index + 1,
            "width": width,
            "height": height,
            "blocks": blocks,
            "images": images
        })

    doc.close()
    return result


def replace_text_on_page(
    pdf_path: str,
    output_path: str,
    page_number: int,
    search_term: str,
    replacement: str,
    case_sensitive: bool = False
) -> int:
    """
    Search for search_term on a specific page, redact it, and insert replacement.
    Returns the number of replacements made.

    Bug fix: previously called apply_redactions() inside the loop causing the page
    content stream to be rewritten on every iteration. Now we collect all style info
    upfront, add ALL redact annotations in one pass, apply redactions once, then
    insert all replacement texts — far safer and more efficient.
    """
    doc = fitz.open(pdf_path)
    if page_number < 1 or page_number > len(doc):
        doc.close()
        raise IndexError("Page number out of bounds")

    page = doc[page_number - 1]
    search_flags = 0 if case_sensitive else fitz.TEXT_CASE_INSENSITIVE
    rects = page.search_for(search_term, flags=search_flags)

    if not rects:
        doc.close()
        return 0

    # Collect style info for each rect BEFORE any redaction changes the page
    text_dict = page.get_text("dict")
    replacements: List[Dict] = []

    for rect in rects:
        font_name = "helv"
        font_size = 11.0
        font_color = (0.0, 0.0, 0.0)

        for b in text_dict.get("blocks", []):
            if b.get("type") != 0:
                continue
            found = False
            for line in b.get("lines", []):
                for span in line.get("spans", []):
                    span_rect = fitz.Rect(span["bbox"])
                    if rect.intersects(span_rect) or span_rect.contains(rect):
                        font_name = span["font"]
                        font_size = span["size"]
                        c = span["color"]
                        font_color = (
                            ((c >> 16) & 255) / 255.0,
                            ((c >> 8) & 255) / 255.0,
                            (c & 255) / 255.0,
                        )
                        found = True
                        break
                if found:
                    break
            if found:
                break

        replacements.append({
            "rect": rect,
            "font_name": resolve_pdf_font(font_name),
            "font_size": font_size,
            "font_color": font_color,
            "insert_point": fitz.Point(rect.x0, rect.y1 - (rect.y1 - rect.y0) * 0.15),
        })

    # Add all redact annotations first, then apply once
    for item in replacements:
        page.add_redact_annot(item["rect"], fill=(1, 1, 1))
    page.apply_redactions()

    # Now insert all replacement texts
    for item in replacements:
        page.insert_text(
            item["insert_point"],
            replacement,
            fontsize=item["font_size"],
            fontname=item["font_name"],
            color=item["font_color"],
        )

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return len(rects)


def save_edited_block(
    pdf_path: str,
    output_path: str,
    page_number: int,
    original_bbox: List[float],
    new_text: str,
    font_size: float,
    font_name: str,
    hex_color: str
) -> bool:
    """
    Erase content in original_bbox and replace with new_text (auto-wrapped).
    """
    doc = fitz.open(pdf_path)
    if page_number < 1 or page_number > len(doc):
        doc.close()
        return False

    page = doc[page_number - 1]
    rect = fitz.Rect(original_bbox)

    page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions()

    color_str = hex_color.lstrip('#')
    r = int(color_str[0:2], 16) / 255.0
    g = int(color_str[2:4], 16) / 255.0
    b = int(color_str[4:6], 16) / 255.0

    resolved_font = resolve_pdf_font(font_name)
    page.insert_textbox(
        rect,
        new_text,
        fontsize=font_size,
        fontname=resolved_font,
        color=(r, g, b)
    )

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return True


def resolve_pdf_font(font_name: str) -> str:
    """
    Maps extracted font names to standard PDF-14 font abbreviations.
    """
    fn = font_name.lower()
    is_bold = "bold" in fn
    is_italic = "italic" in fn or "oblique" in fn

    if "helvetica" in fn or "arial" in fn or "sans" in fn:
        if is_bold and is_italic:
            return "hebi"
        if is_bold:
            return "hebo"
        if is_italic:
            return "heio"
        return "helv"

    if "times" in fn or "serif" in fn or "roman" in fn:
        if is_bold and is_italic:
            return "tibi"
        if is_bold:
            return "tibo"
        if is_italic:
            return "tiit"
        return "times"

    if "courier" in fn or "mono" in fn or "code" in fn:
        if is_bold and is_italic:
            return "cobi"
        if is_bold:
            return "cobo"
        if is_italic:
            return "coit"
        return "cour"

    return "helv"
