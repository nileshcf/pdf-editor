# AeroPDF

AeroPDF is a browser-based PDF editor built with FastAPI, PyMuPDF, React, TypeScript, Vite, PDF.js, and Tesseract.js.

The current app combines two editing models:

- direct PDF text editing for existing document content
- Figma-style editable overlay objects for newly added text, comments, signatures, images, and shapes

Every edit is versioned per session. Undo/redo works across both PDF mutations and overlay-object changes, and exports flatten active overlay objects into the downloaded PDF.

## Current Capabilities

- Edit existing PDF text blocks with redaction + textbox reflow.
- Find and replace text across one page or the full document.
- Run client-side OCR for scanned pages and persist OCR text into version history.
- Add editable overlay objects:
  - text boxes
  - comment boxes
  - signature boxes
  - images
  - rectangle, ellipse, line, and arrow shapes
- Select and move overlay objects on the page.
- Edit object content, color, transform, and appearance from the right properties panel.
- Change object stacking order.
- Flatten overlay objects into the PDF explicitly or export them through download.
- Perform page operations: rotate, duplicate, delete, insert blank page, reorder through the API.
- Use a Figma-inspired light-mode UI with clean page previews, logo branding, and contextual properties.

## Tech Stack

| Area | Stack |
| --- | --- |
| Backend | FastAPI, PyMuPDF, Pydantic, pytest |
| Frontend | React 18, TypeScript, Vite, PDF.js, Tesseract.js, lucide-react |
| Local orchestration | `run.py` |
| Deployment configs | Render backend, Vercel frontend, Docker Compose |
| CI | GitHub Actions for backend tests and frontend build |

## Quick Start

Requirements:

- Python 3.11 recommended
- Node.js 18+
- npm

Run both services:

```bash
python run.py
```

Local URLs:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://127.0.0.1:8000` |
| Health check | `http://127.0.0.1:8000/api/health` |

## Manual Setup

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8000`.

## Verification

Backend tests:

```bash
cd backend
python -m pytest
```

Frontend type check:

```bash
cd frontend
npx tsc --noEmit
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Project Structure

```text
pdf-editor/
  README.md
  ARCHITECTURE.md
  CLAUDE.md
  run.py
  render.yaml
  vercel.json
  docker-compose.yml
  .github/workflows/ci.yml

  backend/
    main.py
    config.py
    deps.py
    logging_config.py
    schemas.py
    sessions.py
    pdf_engine.py
    commands.py
    routers/
      documents.py
      editing.py
      pages.py
      annotations.py
      objects.py
    tests/
      test_engine.py
      test_sessions.py
      test_schemas.py

  frontend/
    package.json
    vite.config.ts
    src/
      api.ts
      App.tsx
      index.css
      components/
        AeroLogo.tsx
        ImageInsertModal.tsx
        PDFCanvas.tsx
        PropertiesPanel.tsx
        Sidebar.tsx
```

## API Overview

All mutating routes return a shared `EditResponse` with fresh pages, metadata, and history state.

Important routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health |
| `POST` | `/api/upload` | Upload a PDF and create a session |
| `GET` | `/api/download/{session_id}` | Download the current PDF, flattening pending overlay objects if needed |
| `DELETE` | `/api/session/{session_id}` | Delete a session |
| `POST` | `/api/replace/{session_id}` | Find and replace text |
| `POST` | `/api/edit-block/{session_id}` | Edit one extracted text block |
| `POST` | `/api/ocr/{session_id}` | Persist OCR text into the PDF |
| `POST` | `/api/command/{session_id}` | Run a supported command |
| `POST` | `/api/undo/{session_id}` | Undo |
| `POST` | `/api/redo/{session_id}` | Redo |
| `POST` | `/api/pages/rotate/{session_id}` | Rotate pages |
| `POST` | `/api/pages/delete/{session_id}` | Delete pages |
| `POST` | `/api/pages/reorder/{session_id}` | Reorder pages |
| `POST` | `/api/pages/duplicate/{session_id}` | Duplicate a page |
| `POST` | `/api/pages/insert-blank/{session_id}` | Insert a blank page |
| `POST` | `/api/add-image/{session_id}` | Add an editable image object |
| `POST` | `/api/draw-shape/{session_id}` | Add an editable shape object |
| `POST` | `/api/add-highlight/{session_id}` | Add a PDF highlight annotation |
| `POST` | `/api/objects/{session_id}` | Create an overlay object directly |
| `PATCH` | `/api/objects/{session_id}/{object_id}` | Update an overlay object |
| `DELETE` | `/api/objects/{session_id}/{object_id}` | Delete an overlay object |
| `POST` | `/api/objects/{session_id}/reorder` | Reorder overlay objects |
| `POST` | `/api/flatten/{session_id}` | Commit overlay objects into a new PDF version |
| `GET` | `/api/assets/{session_id}/{asset_id}` | Serve a stored object asset |

## Configuration

Backend settings use the `AEROPDF_` prefix.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AEROPDF_TEMP_DIR` | system temp dir + `aeropdf_sessions` | Session storage |
| `AEROPDF_MAX_FILE_MB` | `50` | Upload size limit |
| `AEROPDF_MAX_PAGES` | `2000` | Page count limit |
| `AEROPDF_SESSION_TTL_HOURS` | `24` | Session purge age |
| `AEROPDF_MAX_HISTORY_VERSIONS` | `50` | History cap |
| `AEROPDF_ALLOWED_ORIGINS` | localhost Vite origins | CORS allowlist |
| `AEROPDF_LOG_LEVEL` | `INFO` | Log level |
| `AEROPDF_JSON_LOGS` | `false` | JSON logging |
| `AEROPDF_CLEANUP_ON_SHUTDOWN` | `false` | Remove temp storage on shutdown |

Frontend production builds should set:

| Variable | Example |
| --- | --- |
| `VITE_API_BASE` | `https://your-backend.example.com/api` |

## Deployment Notes

The current deployment model remains split:

- frontend on Vercel
- backend on Render

This remains acceptable for anonymous, short-lived editing sessions. The app still does not require a database for the current feature set.

Important limitation: session files and object assets are stored on backend disk. On free-tier hosts without persistent disk, sessions can disappear on restart or redeploy.

## Current Known Gaps

- Object resizing is currently inspector-driven, not drag-handle resize.
- Existing embedded PDF images/shapes are not decomposed into editable overlay objects.
- Zoom is still fixed rather than user-controlled.
- There is no account system, saved document library, team workspace, or audit trail.

## Near-Term Roadmap

- Add drag-handle resize and rotation for overlay objects.
- Add zoom controls with a shared scale model.
- Add page drag-and-drop reorder in the UI.
- Add merge, split, and extract flows.
- Add end-to-end browser tests for upload, object editing, OCR, undo/redo, flatten, and export.
