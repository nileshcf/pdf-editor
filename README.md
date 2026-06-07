# AeroPDF — Web-Based PDF Editor

A browser-based PDF editor with WYSIWYG text editing, client-side OCR for scanned pages, and one-command local setup.

**Stack**: FastAPI + PyMuPDF (backend) · React + TypeScript + Vite + PDF.js (frontend)

---

## Features

- **WYSIWYG text editing** — PDF pages render to `<canvas>` via PDF.js; transparent `<div>` overlays let you double-click any text span to edit it in the properties panel.
- **Find & Replace** — replace a word or phrase across the whole document or a single page. Powered by PyMuPDF redaction + text insertion.
- **Scanned page OCR** — pages with no text layer show an orange prompt; one click runs Tesseract.js in a Web Worker and makes the extracted text fully editable.
- **AI command bar** — issue plain-English commands like `replace "Draft" with "Final"` or `replace "Old" with "New" on page 2`.
- **Export** — download the modified PDF at any time.

---

## Quick start

### Requirements

- Python 3.8+
- Node.js 18+

### Run

```bash
git clone https://github.com/nileshcf/pdf-editor.git
cd pdf-editor
python run.py
```

`run.py` will:
1. Install Python backend deps (`fastapi`, `uvicorn`, `pymupdf`, `python-multipart`).
2. Run `npm install` inside `frontend/` if `node_modules` is missing.
3. Start the FastAPI backend on `http://127.0.0.1:8000`.
4. Start the Vite frontend on `http://localhost:5173` and open it in your browser.

Press `Ctrl+C` to cleanly shut down both servers.

---

## Deployment

### Vercel (recommended — frontend + backend together)

1. Push this repo to GitHub and import it on [vercel.com](https://vercel.com).
2. In **Project Settings → Environment Variables**, add the following for the **frontend** service:

   | Key | Value |
   |-----|-------|
   | `VITE_API_BASE` | `/_/backend/api` |

3. Deploy. Vercel will build the Vite frontend and run the FastAPI backend via `vercel.json` experimental multi-services.

> **Note**: Sessions are stored in memory. A fresh upload is needed after each Vercel cold start.

### Backend on Railway / Render + frontend on Vercel

If you prefer separate services:

1. Deploy `backend/` to Railway or Render (the `Dockerfile` is ready to use).
2. On Vercel, set `VITE_API_BASE` to your backend's public URL + `/api` (e.g. `https://my-backend.railway.app/api`).
3. On your backend service, set `CORS_ORIGINS` to your Vercel frontend URL or keep `allow_origins=["*"]` for development.

### Docker (self-hosted)

```bash
docker-compose up --build
# frontend → http://localhost:80
# backend  → http://localhost:8000
```

---

## Project structure

```
pdf-editor/
├── run.py                  # Dev orchestrator
├── vercel.json             # Vercel multi-service config
├── docker-compose.yml
├── CLAUDE.md               # AI codebase guide (architecture, gotchas, patterns)
├── ARCHITECTURE.md         # Deep-dive: coordinate math, API schemas, OCR pipeline
│
├── backend/
│   ├── main.py             # FastAPI routes
│   ├── utils.py            # PDF manipulation (PyMuPDF)
│   ├── requirements.txt
│   └── Dockerfile
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── .env.example        # Copy to .env.local for production overrides
    └── src/
        ├── App.tsx
        ├── index.css       # Global theme (Dumb Ways to Die flat style)
        └── components/
            ├── PDFCanvas.tsx
            ├── Sidebar.tsx
            ├── PropertiesPanel.tsx
            └── CommandConsole.tsx
```

For a full architectural deep-dive — coordinate mapping math, API schemas, OCR pipeline — see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

For an AI-readable codebase guide (patterns, gotchas, state flow) see [`CLAUDE.md`](./CLAUDE.md).

---

## Contributing

PRs welcome. Run `tsc --noEmit` in `frontend/` before committing to catch type errors.
