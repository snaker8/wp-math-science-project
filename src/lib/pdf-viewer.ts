// ============================================================================
// PDF.js Utility - Centralized PDF loading and caching
// ============================================================================

import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null;
let workerConfigured = false;

// PDF 문서 캐시 (URL → PDFDocumentProxy)
const pdfDocCache = new Map<string, PDFDocumentProxy>();

/**
 * PDF.js 라이브러리를 한 번만 로드하고 Worker를 설정
 */
export async function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((lib) => {
      if (!workerConfigured) {
        lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        workerConfigured = true;
      }
      return lib;
    });
  }
  return pdfjsLibPromise;
}

/**
 * PDF 문서를 로드 (캐시 사용)
 */
export async function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
  const cached = pdfDocCache.get(url);
  if (cached) return cached;

  const pdfjsLib = await getPdfjs();
  const loadingTask = pdfjsLib.getDocument({
    url,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  pdfDocCache.set(url, pdf);
  return pdf;
}

/**
 * PDF 페이지를 캔버스에 렌더링
 */
export async function renderPdfPage(
  canvas: HTMLCanvasElement,
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number,
  maxHeight: number
): Promise<{ width: number; height: number }> {
  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`Invalid page number: ${pageNumber}`);
  }

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });

  // 캔버스에 맞게 스케일 조정
  const scale = Math.min(
    maxWidth / viewport.width,
    maxHeight / viewport.height,
    2.5
  );
  const scaledViewport = page.getViewport({ scale });

  // 캔버스 크기 설정
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2d context not available');

  // 렌더링
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;

  return {
    width: scaledViewport.width,
    height: scaledViewport.height,
  };
}
