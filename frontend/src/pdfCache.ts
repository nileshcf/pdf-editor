// Shared PDF.js document cache.
//
// The main canvas and the sidebar thumbnails both need the same document, and
// the canvas re-runs its render effect on every page switch. Without a cache
// each of those calls getDocument() — a full download + parse of the PDF.
// Keyed by url+version so a new edit (version bump) fetches fresh bytes while
// stale versions are destroyed to free worker memory.
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type PDFDocument = any;

const cache = new Map<string, Promise<PDFDocument>>();

export function getPdfDocument(url: string, version: number): Promise<PDFDocument> {
  const key = `${url}::v${version}`;
  const existing = cache.get(key);
  if (existing) return existing;

  // Evict stale versions of the same document.
  for (const [staleKey, stalePromise] of cache) {
    if (staleKey.startsWith(`${url}::`) && staleKey !== key) {
      cache.delete(staleKey);
      stalePromise.then((doc) => doc?.destroy()).catch(() => {});
    }
  }

  const versionedUrl = url + (url.includes('?') ? '&' : '?') + 'v=' + version;
  const promise = pdfjsLib.getDocument(versionedUrl).promise.catch((err: unknown) => {
    cache.delete(key); // don't poison the cache with a failed load
    throw err;
  });
  cache.set(key, promise);
  return promise;
}
