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
  process.env.NEXT_PUBLIC_IMAGE_PIPELINE_URL || 'http://127.0.0.1:8200';

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
  const buf = Buffer.isBuffer(file) ? file : null;
  const fileName = options.fileName || 'upload.pdf';

  // 대용량 Buffer(1MB 이상): 임시 파일 저장 후 경로만 전달 (Node.js fetch 대용량 FormData 버그 우회)
  if (buf && buf.length > 1_000_000) {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const ext = path.extname(fileName) || '.pdf';
    const tmpFile = path.join(os.tmpdir(), `imgpipe_${Date.now()}${ext}`);
    fs.writeFileSync(tmpFile, buf);

    console.log(`[image-pipeline] extract-local — file: ${tmpFile} (${buf.length} bytes)`);

    try {
      // http 모듈로 직접 요청 (Node.js fetch의 헤더 타임아웃 5분 제한 우회)
      const http = await import('http');
      const reqBody = JSON.stringify({
        file_path: tmpFile,
        file_name: fileName,
        subject: options.subject || 'math',
        source_name: options.sourceName || '',
        science_subject: options.scienceSubject || '',
        enhance: options.enhance ?? true,
        upload_to_supabase: options.uploadToSupabase ?? false,
        min_width: options.minWidth ?? 100,
        min_height: options.minHeight ?? 100,
      });

      const url = new URL(`${PIPELINE_URL}/extract-local`);
      const res: { status: number; body: string } = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: Number(url.port) || 8200,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) },
          timeout: 1_200_000, // 20분
        }, (resp) => {
          const chunks: Buffer[] = [];
          resp.on('data', (c: Buffer) => chunks.push(c));
          resp.on('end', () => resolve({ status: resp.statusCode || 0, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout (20min)')); });
        req.write(reqBody);
        req.end();
      });

      console.log(`[image-pipeline] POST /extract-local response: ${res.status}`);
      if (res.status !== 200) {
        throw new Error(`Image extraction failed (${res.status}): ${res.body.slice(0, 300)}`);
      }
      return JSON.parse(res.body);
    } finally {
      try { (await import('fs')).unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  // 소용량 파일: 기존 FormData 방식 (정상 작동)
  const form = new FormData();
  appendFile(form, file, fileName);

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
    signal: AbortSignal.timeout(600_000),
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
    const http = await import('http');
    const url = new URL(`${PIPELINE_URL}/health`);
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(url.port) || 8200,
        path: '/health',
        method: 'GET',
        timeout: 15000,
      }, (res) => {
        res.resume(); // drain response
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  } catch {
    return false;
  }
}
