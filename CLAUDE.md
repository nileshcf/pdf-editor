# CLAUDE.md — AeroPDF Codebase Guide

> Quick orientation for any AI (or human) coming into this repo cold.

---

## What this project is

**AeroPDF** — a browser-based PDF editor.

- **Backend**: FastAPI + PyMuPDF (Python). Handles PDF parsing, text redaction, text insertion, and file download.
- **Frontend**: React + TypeScript + Vite. Renders PDF pages via PDF.js, overlays editable `<div>`s for WYSIWYG editing, runs OCR via Tesseract.js Web Workers.

---

## Run it locally

```bash
python run.py   # installs deps, starts both servers
# backend  → http://127.0.0.1:8000
# frontend → http://localhost:5173
```

Requirements: Python 3.8+, Node 18+.

---

## Repository layout

```
pdf-editor/
├── run.py                  # Orchestrator — starts both servers
├── vercel.json             # Vercel multi-service deployment config
├── docker-compose.yml      # Docker self-host config
├── CLAUDE.md               # ← you are here
├── ARCHITECTURE.md         # Deep-dive: coordinate math, API schemas, OCR pipeline
├── README.md               # User-facing setup + deployment docs
│
├── backend/
│   ├── main.py             # FastAPI app — all HTTP routes
│   ├── utils.py            # PDF logic — extract, redact, insert text
│   ├── requirements.txt    # Python deps
│   └── Dockerfile
│
└── frontend/
    ├── index.html          # Loads Nunito font from Google Fonts
    ├── vite.config.ts      # Dev proxy: /api → http://localhost:8000
    ├── .env.example        # Env vars needed for production
    └── src/
        ├── main.tsx
        ├── index.css       # Global styles — DWTD flat theme (see below)
        ├── App.tsx         # Root component — state, upload, session, toasts
        └── components/
            ├── PDFCanvas.tsx       # PDF.js render + WYSIWYG overlay + OCR
            ├── Sidebar.tsx         # Page list / thumbnails
            ├── PropertiesPanel.tsx # Block editor + find-and-replace panel
            └── CommandConsole.tsx  # Header command bar ("replace X with Y")
```

---

## Key concepts

### Coordinate mapping

PDF points → CSS pixels via a single scale factor:

```
SCALE = 1.25   (module-level constant in PDFCanvas.tsx)
left   = bbox[0] * SCALE
top    = bbox[1] * SCALE
width  = (bbox[2] - bbox[0]) * SCALE
height = (bbox[3] - bbox[1]) * SCALE
```

PyMuPDF uses top-left origin, same as the browser. No flip needed.

### Text replacement (backend)

Two modes, both in `backend/utils.py`:

| Mode | Trigger | Backend function | PyMuPDF calls |
|------|---------|-----------------|---------------|
| Find & Replace (span-level) | `POST /api/replace` | `replace_text_on_page` | `add_redact_annot` × N → `apply_redactions` once → `insert_text` × N |
| Block edit | `POST /api/edit-block` | `save_edited_block` | `add_redact_annot` → `apply_redactions` → `insert_textbox` |

**Critical**: `apply_redactions()` must be called **once** after all `add_redact_annot` calls, not inside a per-span loop. Calling it inside the loop corrupts the page content stream.

### Session model

Each upload creates a UUID session stored in `backend/temp_docs/<session_id>/`. In-memory dict `sessions` maps `session_id → {original_path, current_path}`. All edit endpoints mutate `current_path` in place.

⚠️ Sessions are in-memory — they don't survive a server restart. On Vercel (serverless), sessions reset between invocations; fine for short editing sessions.

### OCR pipeline

1. `PDFCanvas.tsx` detects a scanned page (`blocks.length === 0 && images.length > 0`).
2. User clicks → `runLocalOCR()` → Tesseract.js worker reads `canvas.toDataURL()`.
3. Tesseract returns pixel-space bboxes → divide by canvas dimensions × PDF dimensions to get PDF-space bboxes.
4. Synthetic block objects pushed into session state via `onOCRComplete` callback — no server round-trip.

---

## Frontend state flow

```
App.tsx
  session       → full PDF metadata + page/block tree from the backend
  activePage    → 1-based index of the currently visible page
  selectedBlock → the span the user double-clicked (drives PropertiesPanel)

  upload  → POST /api/upload  → setSession
  replace → POST /api/replace → setSession (new page tree)
  edit    → POST /api/edit-block → setSession
  command → POST /api/command → setSession
  export  → GET  /api/download (opens new tab)
```

---

## API reference

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/api/upload` | `multipart/form-data` file | Session object (id, filename, metadata, pages[]) |
| POST | `/api/replace/{session_id}` | `{search_term, replacement, page_number?}` | `{pages[], replacements_made}` |
| POST | `/api/edit-block/{session_id}` | `{page_number, original_bbox, new_text, font_size, font_name, hex_color}` | `{pages[]}` |
| POST | `/api/command/{session_id}` | `{command}` (NL string) | `{pages[], message}` |
| GET | `/api/download/{session_id}` | — | PDF file |

---

## UI theme — "Dumb Ways to Die"

Flat, vivid, NO gradients. All in `frontend/src/index.css`.

| Token | Value | Used for |
|-------|-------|---------|
| `--red` | `#FF3B2F` | Header bar, danger |
| `--teal` | `#00BCD4` | Primary buttons, active states |
| `--yellow` | `#FFD600` | Find & replace card accent |
| `--orange` | `#FF8B00` | Scanned page badges |
| `--green` | `#4CAF50` | Success toasts |
| `--bg` | `#F8F4EE` | Page background (warm off-white) |
| `--r-pill` | `999px` | Pill-shaped buttons |

Font: **Nunito** (Google Fonts, 400–900 weights) — rounded, friendly, playful.

---

## Common gotchas

- **Null bytes in files**: Writing to the Windows-mounted path via some tools injects `\x00` bytes. Fix: `raw.replace(b'\x00', b'')` before write. Check with `grep -c $'\x00' <file>`.
- **Linter truncation**: A formatter on the dev machine may truncate files on save. Write files via bash heredoc (`python3 << 'PYEOF' ... PYEOF`) to bypass.
- **PDF.js worker version**: Must match the `pdfjs-dist` npm package version (`3.4.120`). Worker CDN URL is hardcoded in `PDFCanvas.tsx` line 7.
- **`apply_redactions` loop bug**: Fixed — do NOT call inside a per-span loop. One call after all annotations.
- **`run.py` shell=True bug**: Fixed — backend now launched with `[sys.executable, "-m", "uvicorn", ...]` without `shell=True`.
- **Render race condition**: Fixed — `PDFCanvas.tsx` uses per-invocation `cancelled` flag, not stale `rendering` state.

---

## Deployment

### Local (development)
```bash
python run.py
```

### Docker (self-hosted)
```bash
docker-compose up --build
# frontend → :80, backend → :8000
```

### Vercel (frontend + backend together)
See `vercel.json` — uses Vercel experimental multi-services.
Set env var on Vercel dashboard → frontend service:
```
VITE_API_BASE=/_/backend/api
```
Or deploy backend separately (Railway / Render) and set `VITE_API_BASE` to that URL.
