# AeroPDF Architecture

This document describes the current app architecture after the UI revamp and overlay-object implementation.

## System Overview

AeroPDF runs as two services:

| Service | Responsibility |
| --- | --- |
| React/Vite frontend | PDF rendering, page previews, overlay-object interaction, OCR trigger, inspector UI |
| FastAPI backend | PDF extraction, validated mutations, session/version storage, object storage, undo/redo, export |

There are now two editing surfaces in the product:

1. existing PDF text content edited directly in the underlying PDF
2. newly added editor objects stored as overlay metadata until flattened

That split is deliberate. It keeps the current PyMuPDF text-edit flow working while enabling a Figma-like object editor for newly inserted elements.

## High-Level Flow

```text
Upload PDF
  -> POST /api/upload
  -> SessionManager creates version 0000.pdf and 0000.json
  -> backend extracts pages, text spans, images, metadata
  -> frontend renders page canvas + overlays

Edit existing PDF text
  -> POST /api/edit-block or /api/replace or /api/ocr
  -> SessionManager.mutate(...)
  -> pdf_engine mutates fitz.Document
  -> SessionManager writes next PDF snapshot and clones object snapshot

Edit overlay object
  -> POST/PATCH/DELETE /api/objects/* or add-image/draw-shape
  -> SessionManager.mutate_objects(...)
  -> current PDF snapshot is copied forward unchanged
  -> object metadata writes a new JSON snapshot

Download / flatten
  -> SessionManager.export_path(...) or SessionManager.flatten(...)
  -> pdf_engine.flatten_objects(...)
  -> overlay objects are written into a temporary or committed PDF
```

## Backend Modules

| File | Role |
| --- | --- |
| `main.py` | FastAPI app assembly, middleware, purge loop, router wiring |
| `config.py` | `AEROPDF_*` environment settings |
| `schemas.py` | Request/response models, bbox validation, color validation, object schemas |
| `sessions.py` | Session lifecycle, PDF versions, object versions, assets, undo/redo, exports |
| `pdf_engine.py` | Stateless PDF extraction and mutation functions |
| `commands.py` | Deterministic command parser |
| `deps.py` | Shared `SessionManager`, session lookup, shared `EditResponse` builder |
| `routers/documents.py` | Upload, download, delete session |
| `routers/editing.py` | Replace, block edit, OCR persistence, command, undo, redo |
| `routers/pages.py` | Rotate, delete, reorder, duplicate, insert blank |
| `routers/annotations.py` | Highlight annotations plus compatibility routes for image/shape object creation |
| `routers/objects.py` | Create/update/delete/reorder/flatten overlay objects, serve assets |

## Session Storage Model

Each session has a directory under `settings.temp_dir`.

```text
<temp_dir>/
  <session_id>/
    manifest.json
    versions/
      0000.pdf
      0001.pdf
      ...
    object_versions/
      0000.json
      0001.json
      ...
    assets/
      <asset_id>.png
      <asset_id>.jpg
    exports/
      download-0003.pdf
```

`manifest.json` stores:

- `session_id`
- original filename
- ordered PDF version filenames
- ordered object version filenames
- current history index
- created/updated timestamps

The important rule is that PDF versions and object versions share the same history index.

That means:

- undo/redo restores both the PDF snapshot and the object snapshot
- a PDF-only mutation clones the current object snapshot forward
- an object-only mutation copies the current PDF snapshot forward

This keeps one linear history instead of two diverging histories.

## Object Model

Overlay objects are stored as JSON objects with a stable `id` and a common shape:

- `id`
- `page_number`
- `type`
- `bbox`
- `rotation`
- `opacity`
- `z_index`
- `locked`
- `hidden`

Supported object types:

- `text`
- `comment`
- `signature`
- `image`
- `shape`

Type-specific fields:

- text-like objects: `text`, `font_family`, `font_size`, `font_weight`, `font_style`, `color`, `align`
- image objects: `asset_id`
- shape objects: `shape_type`, `stroke_color`, `fill_color`, `line_width`

Current frontend interaction:

- create
- select
- drag/move
- edit from inspector
- delete
- reorder z-index

Current limitation:

- resize is done by numeric inspector values, not direct drag handles
- rotation is stored in the schema but not yet applied in the UI/flatten path

## Mutation Boundaries

### `SessionManager.mutate`

Use this for true PDF mutations:

- replace text
- edit block
- OCR insertion
- rotate/delete/reorder/duplicate/insert page
- highlight annotation
- flatten commit

Flow:

1. lock session
2. open current PDF
3. mutate `fitz.Document`
4. save next PDF snapshot
5. clone current object snapshot
6. commit history

### `SessionManager.mutate_objects`

Use this for overlay metadata changes:

- create/update/delete object
- reorder objects
- add image object
- add shape object

Flow:

1. lock session
2. read current object JSON
3. mutate object list
4. copy current PDF forward untouched
5. save next object JSON snapshot
6. commit history

## Extraction Model

`pdf_engine.extract_pdf_data(doc)` extracts:

- document metadata
- page geometry
- text blocks / lines / spans
- page images

`SessionManager.extract(session_id)` then augments each page with:

- `objects: EditorObject[]`

That means the frontend page tree is the single source for:

- rendered PDF background
- selectable existing text spans
- editable overlay objects

## Flatten / Export Model

Overlay objects are not written into the PDF immediately.

Two paths exist:

### Download path

`GET /api/download/{session_id}` calls `SessionManager.export_path(session_id)`.

- if there are no overlay objects, it returns the current PDF path
- if overlay objects exist, it creates a flattened export PDF in `exports/` and serves that file

This does not change history.

### Commit path

`POST /api/flatten/{session_id}` calls `SessionManager.flatten(session_id)`.

- overlay objects are written into a new PDF version
- a new empty object snapshot is created
- history advances

This is the explicit “commit overlay layer into the document” action.

## PDF Engine Responsibilities

`pdf_engine.py` remains stateless. It never owns session paths or manifests.

Main responsibilities:

- extract pages/spans/images
- replace text
- edit text blocks
- rotate/delete/reorder/duplicate pages
- insert OCR text
- insert highlight annotations
- flatten overlay objects into a document

`flatten_objects(doc, objects, asset_resolver)` currently handles:

- shape objects via drawing primitives
- image objects via `insert_image`
- text/signature objects via `insert_textbox`
- comment objects via a filled rectangle plus text

## Frontend Architecture

### `App.tsx`

Owns:

- session pages and metadata
- undo/redo history state
- active page
- active tool
- selected extracted text block
- selected overlay object
- mutation handlers
- global toasts and modal state

The editor shell is now explicitly Figma-like:

- fixed top toolbar
- left pages panel
- centered canvas workspace
- right contextual inspector

### `PDFCanvas.tsx`

Renders:

- PDF.js canvas background
- extracted text span hitboxes
- overlay object layer
- OCR overlay state
- draw preview state

It now supports:

- selecting existing text spans for block edits
- selecting overlay objects
- dragging overlay objects
- click-to-create text/comment/signature objects
- drag-to-create shape objects

### `Sidebar.tsx`

Renders:

- logo header
- clean framed page previews
- active page state

PDF thumbnails are still sourced from PDF.js, but the presentation is more controlled and document-like.

### `PropertiesPanel.tsx`

Acts as a contextual inspector.

It supports:

- page actions
- extracted text block editing
- overlay object transform/content/appearance editing
- layer ordering
- export and flatten actions

## Coordinate Model

Current frontend render scale:

```ts
const SCALE = 1.25;
```

Conversions:

```text
css_left   = pdf_x0 * SCALE
css_top    = pdf_y0 * SCALE
css_width  = (pdf_x1 - pdf_x0) * SCALE
css_height = (pdf_y1 - pdf_y0) * SCALE
```

Dragging:

```text
pdf_dx = pointer_delta_x / SCALE
pdf_dy = pointer_delta_y / SCALE
```

OCR:

```text
pdf_x = (ocr_pixel_x / canvas_width) * page_width
pdf_y = (ocr_pixel_y / canvas_height) * page_height
```

Any zoom feature must replace the fixed `SCALE` with shared zoom state used by:

- PDF.js viewport rendering
- overlay object layout
- extracted text hitboxes
- drag math
- OCR coordinate conversion

## API Surface

Important routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Create session |
| `GET` | `/api/download/{session_id}` | Flatten-on-download export |
| `POST` | `/api/edit-block/{session_id}` | Edit existing PDF text block |
| `POST` | `/api/replace/{session_id}` | Replace text |
| `POST` | `/api/ocr/{session_id}` | Persist OCR into the PDF |
| `POST` | `/api/add-image/{session_id}` | Create image overlay object |
| `POST` | `/api/draw-shape/{session_id}` | Create shape overlay object |
| `POST` | `/api/add-highlight/{session_id}` | Add highlight directly into the PDF |
| `POST` | `/api/objects/{session_id}` | Create object |
| `PATCH` | `/api/objects/{session_id}/{object_id}` | Update object |
| `DELETE` | `/api/objects/{session_id}/{object_id}` | Delete object |
| `POST` | `/api/objects/{session_id}/reorder` | Reorder object z-index |
| `POST` | `/api/flatten/{session_id}` | Commit overlay objects into a PDF version |
| `GET` | `/api/assets/{session_id}/{asset_id}` | Serve stored object asset |

## Why There Is Still No Database

The current app remains anonymous and session-based.

A database is still unnecessary for:

- single-user editing sessions
- undo/redo
- object-layer editing
- export

A database becomes justified only when the product needs:

- authentication
- saved documents across sessions
- team workspaces
- audit trails
- durable metadata separate from session files

On a free-tier roadmap, adding a DB before those needs exist would mostly add deployment complexity, not product value.

## Recommended Next Work

1. Add drag-handle resize and rotation for overlay objects.
2. Add zoom controls with a single shared scale source.
3. Add page drag-and-drop reorder in the UI.
4. Add merge/split/extract flows.
5. Add Playwright coverage for object editing, flatten, and export.
