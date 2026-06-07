// Centralised API client for the AeroPDF backend.
// Every mutating endpoint returns the same EditResponse shape, so callers can
// uniformly refresh pages + history from one place (see App.applyEdit).

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface HistoryState {
  can_undo: boolean;
  can_redo: boolean;
  version: number;
  total_versions: number;
}

export interface PDFPage {
  number: number;
  width: number;
  height: number;
  rotation?: number;
  is_scanned?: boolean;
  blocks: any[];
  images: any[];
}

export interface EditResponse {
  success: boolean;
  message?: string;
  pages: PDFPage[];
  metadata: { title: string; author: string; pages: number };
  history: HistoryState;
  replacements_made?: number;
  warnings?: string[];
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).detail || (data as any).message || `Request failed (${res.status})`);
  }
  return data as T;
}

const post = (path: string, body?: unknown) =>
  fetch(API_BASE + path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export const api = {
  base: API_BASE,
  downloadUrl: (sid: string) => `${API_BASE}/download/${sid}`,

  async upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return parse<EditResponse & { session_id: string; filename: string }>(
      await fetch(API_BASE + '/upload', { method: 'POST', body: fd })
    );
  },

  replace: (sid: string, body: object) => post(`/replace/${sid}`, body).then(parse<EditResponse>),
  editBlock: (sid: string, body: object) => post(`/edit-block/${sid}`, body).then(parse<EditResponse>),
  command: (sid: string, command: string) => post(`/command/${sid}`, { command }).then(parse<EditResponse>),
  undo: (sid: string) => post(`/undo/${sid}`).then(parse<EditResponse>),
  redo: (sid: string) => post(`/redo/${sid}`).then(parse<EditResponse>),

  rotate: (sid: string, page: number, degrees: number) =>
    post(`/pages/rotate/${sid}`, { page_numbers: [page], degrees }).then(parse<EditResponse>),
  deletePages: (sid: string, pages: number[]) =>
    post(`/pages/delete/${sid}`, { page_numbers: pages }).then(parse<EditResponse>),
  duplicate: (sid: string, page: number) =>
    post(`/pages/duplicate/${sid}`, { page_number: page }).then(parse<EditResponse>),
  insertBlank: (sid: string, afterPage: number) =>
    post(`/pages/insert-blank/${sid}`, { after_page: afterPage }).then(parse<EditResponse>),
};
