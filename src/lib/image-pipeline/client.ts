/**
 * Image Pipeline Python 서비스 클라이언트
 * FastAPI 서버 (port 8200)와 통신
 */

import type {
  ImageExtractResponse,
  EnhanceResponse,
  DiagramDBStats,
  SimilaritySearchResponse,
  DiagramSubject,
} from './types';

const PIPELINE_URL =
  process.env.NEXT_PUBLIC_IMAGE_PIPELINE_URL || 'http://localhost:8200';

/** Buffer → Blob 변환 헬퍼 */
function toBlob(buf: Buffer): Blob {
  const arr = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new Blob([arr as unknown as BlobPart]);
}

/** file 인자를 FormData에 추가 */
function appendFile(
  form: FormData,
  file: File | Buffer,
  fallbackName: string,
): void {
  if (Buffer.isBuffer(file)) {
    form.append('file', toBlob(file), fallbackName);
  } else {
    form.append('file', file);
  }
}

// ── 이미지 추출 ──────────────────────────────────────────────

/**
 * HWP/PDF 파일에서 이미지를 추출하고 보정한다.
 */
export async function extractImages(
  file: File | Buffer,
  options: {
    fileName?: string;
    subject?: DiagramSubject;
    sourceName?: string;
    scienceSubject?: string;
    enhance?: boolean;
    uploadToSupabase?: boolean;
    minWidth?: number;
    minHeight?: number;
  } = {}
): Promise<ImageExtractResponse> {
  const form = new FormData();
  appendFile(form, file, options.fileName || 'upload.pdf');

  form.append('subject', options.subject || 'math');
  form.append('source_name', options.sourceName || '');
  if (options.scienceSubject) form.append('science_subject', options.scienceSubject);
  form.append('enhance', String(options.enhance ?? true));
  form.append('upload_to_supabase', String(options.uploadToSupabase ?? false));
  form.append('min_width', String(options.minWidth ?? 100));
  form.append('min_height', String(options.minHeight ?? 100));

  const res = await fetch(`${PIPELINE_URL}/extract`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(600_000), // 10분 타임아웃 (대용량 PDF)
  } as RequestInit);

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Image extraction failed: ${error}`);
  }

  return res.json();
}

// ── 단일 이미지 보정 ─────────────────────────────────────────

/**
 * 단일 이미지를 보정하고 base64로 반환받는다.
 */
export async function enhanceImage(
  file: File | Buffer,
  options: { fileName?: string; targetShortSide?: number } = {}
): Promise<EnhanceResponse> {
  const form = new FormData();
  appendFile(form, file, options.fileName || 'image.png');

  form.append('target_short_side', String(options.targetShortSide ?? 600));

  const res = await fetch(`${PIPELINE_URL}/enhance`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Image enhancement failed: ${await res.text()}`);
  }

  return res.json();
}

// ── DB 조회 ──────────────────────────────────────────────────

/**
 * 도식 DB 통계 조회
 */
export async function getDBStats(): Promise<DiagramDBStats> {
  const res = await fetch(`${PIPELINE_URL}/db/stats`);
  if (!res.ok) throw new Error('Failed to get DB stats');
  return res.json();
}

/**
 * 도식 DB 검색
 */
export async function searchDiagrams(params: {
  subject?: string;
  diagramType?: string;
  tags?: string[];
  unitCode?: string;
  limit?: number;
}): Promise<{ count: number; images: unknown[] }> {
  const searchParams = new URLSearchParams();
  if (params.subject) searchParams.set('subject', params.subject);
  if (params.diagramType) searchParams.set('diagram_type', params.diagramType);
  if (params.tags?.length) searchParams.set('tags', params.tags.join(','));
  if (params.unitCode) searchParams.set('unit_code', params.unitCode);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const res = await fetch(`${PIPELINE_URL}/db/search?${searchParams}`);
  if (!res.ok) throw new Error('DB search failed');
  return res.json();
}

/**
 * 유사 이미지 검색 (Perceptual Hash 기반)
 */
export async function findSimilarImages(
  file: File | Buffer,
  options: { fileName?: string; threshold?: number } = {}
): Promise<SimilaritySearchResponse> {
  const form = new FormData();
  appendFile(form, file, options.fileName || 'query.png');

  form.append('threshold', String(options.threshold ?? 40));

  const res = await fetch(`${PIPELINE_URL}/db/find-similar`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error('Similarity search failed');
  return res.json();
}

// ── AI 태깅 ──────────────────────────────────────────────────

/**
 * 미분류 이미지 일괄 AI 태깅
 */
export async function tagBatch(
  options: { useBatchApi?: boolean } = {}
): Promise<{ mode: string; total: number; tagged: number; errors: number }> {
  const res = await fetch('/api/image-pipeline/tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'batch',
      use_batch_api: options.useBatchApi ?? false,
    }),
    signal: AbortSignal.timeout(600_000),
  });

  if (!res.ok) throw new Error(`Batch tagging failed: ${await res.text()}`);
  return res.json();
}

/**
 * 전체 이미지 재태깅 (이미 태깅된 것 포함)
 */
export async function retagAll(
  options: { force?: boolean } = {}
): Promise<{ mode: string; total: number; tagged: number; errors: number }> {
  const res = await fetch('/api/image-pipeline/tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'retag-all',
      force: options.force ?? true,
    }),
    signal: AbortSignal.timeout(600_000),
  });

  if (!res.ok) throw new Error(`Retag failed: ${await res.text()}`);
  return res.json();
}

// ── 헬스 체크 ────────────────────────────────────────────────

/**
 * 파이프라인 서버 상태 확인
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${PIPELINE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
