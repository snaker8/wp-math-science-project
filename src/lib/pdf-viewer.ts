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
 * 메모리 누수 방지 — 페이지 unmount 시 호출.
 * url 지정 시 해당 PDF 만, 미지정 시 전체 캐시 비움.
 * PDFDocumentProxy.destroy() 가 내부 worker·page 캐시·텍스처 해제.
 */
export function clearPdfCache(url?: string): void {
  if (url) {
    const pdf = pdfDocCache.get(url);
    if (pdf) {
      try { pdf.destroy(); } catch { /* already destroyed */ }
      pdfDocCache.delete(url);
    }
  } else {
    pdfDocCache.forEach((pdf) => {
      try { pdf.destroy(); } catch { /* already destroyed */ }
    });
    pdfDocCache.clear();
  }
}

/**
 * PDF 페이지를 캔버스에 렌더링
 *
 * @param rotation - 0|90|180|270. PDF.js 네이티브 회전 — viewport.width/height 가 90/270 시 자동 swap.
 *                   가로 PDF 자동 정렬 + 사용자 토글 (2026-05-22).
 */
export async function renderPdfPage(
  canvas: HTMLCanvasElement,
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number,
  maxHeight: number,
  rotation: 0 | 90 | 180 | 270 = 0
): Promise<{ width: number; height: number }> {
  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`Invalid page number: ${pageNumber}`);
  }

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation });

  // 캔버스에 맞게 스케일 조정
  const scale = Math.min(
    maxWidth / viewport.width,
    maxHeight / viewport.height,
    2.5
  );
  const scaledViewport = page.getViewport({ scale, rotation });

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

/**
 * 가로 페이지를 세로로 정렬할 회전값 자동 감지.
 * @returns rotation: 90 if landscape (width > height), 0 otherwise
 */
export async function detectPageRotation(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<0 | 90> {
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return viewport.width > viewport.height ? 90 : 0;
  } catch {
    return 0;
  }
}

/**
 * bbox 좌표 회전 변환 (0~1 정규화 좌표계).
 * 원본 PDF 좌표 → 회전된 디스플레이 좌표.
 */
export function rotateBbox(
  bbox: { x: number; y: number; w: number; h: number },
  rotation: 0 | 90 | 180 | 270
): { x: number; y: number; w: number; h: number } {
  const { x, y, w, h } = bbox;
  switch (rotation) {
    case 90:  return { x: 1 - y - h, y: x,             w: h, h: w };
    case 180: return { x: 1 - x - w, y: 1 - y - h,     w,    h    };
    case 270: return { x: y,         y: 1 - x - w,     w: h, h: w };
    default:  return { x, y, w, h };
  }
}

/**
 * 회전된 디스플레이 좌표 → 원본 PDF 좌표.
 * DB 저장 시 항상 원본 좌표를 유지하기 위한 역변환.
 */
export function unrotateBbox(
  bbox: { x: number; y: number; w: number; h: number },
  rotation: 0 | 90 | 180 | 270
): { x: number; y: number; w: number; h: number } {
  const { x, y, w, h } = bbox;
  switch (rotation) {
    case 90:  return { x: y,             y: 1 - x - w, w: h, h: w };
    case 180: return { x: 1 - x - w,     y: 1 - y - h, w,    h    };
    case 270: return { x: 1 - y - h,     y: x,         w: h, h: w };
    default:  return { x, y, w, h };
  }
}
