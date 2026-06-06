import fitz
import os
from typing import Dict, List, Any, Tuple

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
        # Obtain page width and height
        rect = page.rect
        width = rect.width
        height = rect.height
        
        # Get structured text dict
        text_dict = page.get_text("dict", flags=fitz.TEXTFLAGS_SEARCH)
        
        blocks = []
        for b in text_dict.get("blocks", []):
            if b.get("type") == 0:  # Text block
                block_data = {
                    "bbox": b["bbox"],  # [x0, y0, x1, y1]
                    "lines": []
                }
                for line in b.get("lines", []):
                    line_data = {
                        "bbox": line["bbox"],
                        "spans": []
                    }
                    for span in line.get("spans", []):
                        # Convert integer sRGB color to hex format
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
                
        # Also find images on the page
        image_list = page.get_images(full=True)
        images = []
        for img_index, img in enumerate(image_list):
            xref = img[0]
            # Try to get image bounding box on page
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
        
    # Get spans to analyze styles for substitution
    text_dict = page.get_text("dict")
    
    for rect in rects:
        # Find matching styling properties
        font_name = "helv"  # Default fallback font (Helvetica)
        font_size = 11
        font_color = (0, 0, 0)
        
        found_style = False
        for b in text_dict.get("blocks", []):
            if b.get("type") == 0:
                for line in b.get("lines", []):
                    for span in line.get("spans", []):
                        span_rect = fitz.Rect(span["bbox"])
                        # If overlap matches, pull style properties
                        if rect.intersects(span_rect) or span_rect.contains(rect):
                            font_name = span["font"]
                            font_size = span["size"]
                            # Convert integer RGB back to float RGB [0,1]
                            c = span["color"]
                            r = ((c >> 16) & 255) / 255.0
                            g = ((c >> 8) & 255) / 255.0
                            b_val = (c & 255) / 255.0
                            font_color = (r, g, b_val)
                            found_style = True
                            break
                    if found_style:
                        break
            if found_style:
                break
                
        # Redact the old bounding box
        # We fill with white (1, 1, 1) to erase background
        page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()
        
        # Insert replacement text
        # Align insert coordinate to baseline (shift slightly down from top-left)
        insert_point = fitz.Point(rect.x0, rect.y1 - (rect.y1 - rect.y0) * 0.15)
        
        # We try to use standard PDF font names mapping to avoid missing font exceptions
        resolved_font = resolve_pdf_font(font_name)
        
        page.insert_text(
            insert_point,
            replacement,
            fontsize=font_size,
            fontname=resolved_font,
            color=font_color
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
    Erase content in original_bbox, and replace it with new_text (which wraps inside).
    Supports multi-line text reflow.
    """
    doc = fitz.open(pdf_path)
    if page_number < 1 or page_number > len(doc):
        doc.close()
        return False
        
    page = doc[page_number - 1]
    rect = fitz.Rect(original_bbox)
    
    # Redact original location
    page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions()
    
    # Parse color
    color_str = hex_color.lstrip('#')
    r = int(color_str[0:2], 16) / 255.0
    g = int(color_str[2:4], 16) / 255.0
    b = int(color_str[4:6], 16) / 255.0
    
    # Insert new text block (wrapped)
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
    Maps extraction font names to standard standard-14 PDF fonts to ensure safety.
    """
    font_lower = font_name.lower()
    if "helvetica" in font_lower or "arial" in font_lower or "sans" in font_lower:
        if "bold" in font_lower and "italic" in font_lower:
            return "hebi"  # Helvetica Bold Oblique
        elif "bold" in font_lower:
            return "hebo"  # Helvetica Bold
        elif "italic" in font_lower or "oblique" in font_lower:
            return "heio"  # Helvetica Oblique
        return "helv"      # Helvetica regular
    elif "times" in font_lower or "serif" in font_lower or "roman" in font_lower:
        if "bold" in font_lower and "italic" in font_lower:
            return "tibi"  # Times Bold Italic
        elif "bold" in font_lower:
            return "tibo"  # Times Bold
        elif "italic" in font_lower:
            return "tiit"  # Times Italic
        return "times"     # Times Roman
    elif "courier" in font_lower or "mono" in font_lower or "code" in font_lower:
        if "bold" in font_lower and "italic" in font_lower:
            return "cobi"  # Courier Bold Italic
        elif "bold" in font_lower:
            return "cobo"  # Courier Bold
        elif "italic" in font_lower:
            return "coit"  # Courier Italic
        return "cour"      # Courier
    
    # Default fallback
    return "helv"
