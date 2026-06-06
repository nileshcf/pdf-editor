import os
import shutil
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

from utils import extract_pdf_data, replace_text_on_page, save_edited_block

app = FastAPI(title="Web PDF Editor Backend")

# Enable CORS for frontend local server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for specific origin (e.g., http://localhost:5173) in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_docs")
os.makedirs(TEMP_DIR, exist_ok=True)

# Tracks active sessions and paths to original vs modified files
# In-memory session db: session_id -> { "original_path": str, "current_path": str }
sessions = {}

class ReplaceRequest(BaseModel):
    search_term: str
    replacement: str
    page_number: Optional[int] = None  # None means all pages

class EditBlockRequest(BaseModel):
    page_number: int
    original_bbox: List[float]
    new_text: str
    font_size: float
    font_name: str
    hex_color: str

class CommandRequest(BaseModel):
    command: str

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Accepts PDF upload, generates a session, and parses layout mapping metadata.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    original_path = os.path.join(session_dir, "original.pdf")
    current_path = os.path.join(session_dir, "current.pdf")
    
    # Save file contents
    with open(original_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    shutil.copyfile(original_path, current_path)
    
    try:
        pdf_data = extract_pdf_data(current_path)
    except Exception as e:
        # Cleanup directory in case of failure
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {str(e)}")
        
    sessions[session_id] = {
        "original_path": original_path,
        "current_path": current_path,
        "session_dir": session_dir
    }
    
    return {
        "session_id": session_id,
        "filename": file.filename,
        "metadata": pdf_data["metadata"],
        "pages": pdf_data["pages"]
    }

@app.post("/api/replace/{session_id}")
async def replace_text(session_id: str, request: ReplaceRequest):
    """
    Finds and replaces occurrences of search_term on a specific page or all pages.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
        
    session = sessions[session_id]
    current_path = session["current_path"]
    
    replacements_made = 0
    pdf_data = extract_pdf_data(current_path)
    total_pages = pdf_data["metadata"]["pages"]
    
    try:
        if request.page_number is not None:
            # Single page replacement
            replacements_made = replace_text_on_page(
                current_path, current_path, request.page_number,
                request.search_term, request.replacement
            )
        else:
            # Multi-page replacement
            for p in range(1, total_pages + 1):
                count = replace_text_on_page(
                    current_path, current_path, p,
                    request.search_term, request.replacement
                )
                replacements_made += count
                
        # Re-extract fresh layout metrics
        updated_data = extract_pdf_data(current_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during search & replace: {str(e)}")
        
    return {
        "success": True,
        "replacements_made": replacements_made,
        "pages": updated_data["pages"]
    }

@app.post("/api/edit-block/{session_id}")
async def edit_block(session_id: str, request: EditBlockRequest):
    """
    Replaces a specific layout paragraph block with wrapped reflowed text.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
        
    session = sessions[session_id]
    current_path = session["current_path"]
    
    try:
        success = save_edited_block(
            current_path,
            current_path,
            request.page_number,
            request.original_bbox,
            request.new_text,
            request.font_size,
            request.font_name,
            request.hex_color
        )
        if not success:
            raise HTTPException(status_code=400, detail="Failed to save edited block.")
            
        updated_data = extract_pdf_data(current_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error editing block: {str(e)}")
        
    return {
        "success": True,
        "pages": updated_data["pages"]
    }

@app.post("/api/command/{session_id}")
async def run_command(session_id: str, request: CommandRequest):
    """
    Simple command-driven NLP interpreter interface.
    E.g. "replace 'Draft' with 'Final'" or "erase pages 2-3"
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
        
    session = sessions[session_id]
    current_path = session["current_path"]
    cmd = request.command.strip()
    
    # Simple regex / syntax router
    # 1. Replace command: replace "abc" with "xyz"
    import re
    replace_match = re.match(r'replace\s+["\'“](.*?)["\'”]\s+with\s+["\'“](.*?)["\'”](?:\s+on\s+page\s+(\d+))?', cmd, re.IGNORECASE)
    
    if replace_match:
        search_term = replace_match.group(1)
        replacement = replace_match.group(2)
        page_num = replace_match.group(3)
        page_int = int(page_num) if page_num else None
        
        replacements_made = 0
        pdf_data = extract_pdf_data(current_path)
        total_pages = pdf_data["metadata"]["pages"]
        
        if page_int:
            replacements_made = replace_text_on_page(
                current_path, current_path, page_int, search_term, replacement
            )
        else:
            for p in range(1, total_pages + 1):
                replacements_made += replace_text_on_page(
                    current_path, current_path, p, search_term, replacement
                )
                
        updated_data = extract_pdf_data(current_path)
        return {
            "success": True,
            "message": f"Successfully replaced '{search_term}' with '{replacement}' ({replacements_made} instances).",
            "pages": updated_data["pages"]
        }
        
    # Unsupported or unrecognized command
    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "message": f"Command not recognized: '{cmd}'. Supported commands: replace \"search\" with \"replacement\" [on page X]"
        }
    )

@app.get("/api/download/{session_id}")
async def download_file(session_id: str):
    """
    Returns the edited PDF file to save locally.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
        
    session = sessions[session_id]
    current_path = session["current_path"]
    
    return FileResponse(
        current_path,
        media_type="application/pdf",
        filename="edited_document.pdf"
    )

@app.on_event("shutdown")
def cleanup_temp_files():
    """
    Cleans up all temporary uploaded documents on server shutdown.
    """
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
