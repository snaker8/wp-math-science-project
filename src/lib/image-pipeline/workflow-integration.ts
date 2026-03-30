/**
 * 이미지 파이프라인 ↔ 기존 워크플로우 통합
 *
 * 기존 processDocument() 파이프라인의 OCR 처리 후
 * 병렬로 이미지 추출을 실행할 수 있다.
 *
 * 사용법:
 *   const ocrResult = await processDocument(buffer, fileName, onProgress);
 *   const images = await extractDocumentImages(buffer, fileName, { subject: 'physics' });
 */

import { extractImages, checkHealth } from './client';
import type { ImageExtractResponse, DiagramSubject } from './types';

/**
 * 문서에서 도식 이미지를 추출한다 (기존 OCR과 독립적으로 실행 가능).
 *
 * @param fileBuffer - 원본 파일 버퍼
 * @param fileName - 파일명 (확장자로 HWP/PDF 판별)
 * @param options - 과목, 소스명 등
 * @returns 추출 결과 또는 서버 미실행 시 null
 */
export async function extractDocumentImages(
  fileBuffer: ArrayBuffer,
  fileName: string,
  options: {
    subject?: DiagramSubject;
    sourceName?: string;
    scienceSubject?: string;
    enhance?: boolean;
    uploadToSupabase?: boolean;
  } = {}
): Promise<ImageExtractResponse | null> {
  // 파이프라인 서버 상태 확인
  const healthy = await checkHealth();
  if (!healthy) {
    console.warn(
      '[image-pipeline] 서버 미실행 (port 8200). 이미지 추출 건너뜀.'
    );
    return null;
  }

  const ext = fileName.toLowerCase().split('.').pop();
  if (!ext || !['pdf', 'hwp'].includes(ext)) {
    return null; // 이미지 파일은 추출 불필요
  }

  const buffer = Buffer.from(fileBuffer);

  try {
    const result = await extractImages(buffer, {
      fileName,
      subject: options.subject || 'math',
      sourceName: options.sourceName || fileName.replace(/\.[^.]+$/, ''),
      scienceSubject: options.scienceSubject,
      enhance: options.enhance ?? true,
      uploadToSupabase: options.uploadToSupabase ?? false,
    });

    console.log(
      `[image-pipeline] ${fileName}: ${result.extracted_count}개 추출, ` +
        `${result.enhanced_count}개 보정, ${result.db_entries_added}개 DB 추가`
    );

    return result;
  } catch (error) {
    console.error('[image-pipeline] extraction error:', error);
    return null;
  }
}

/**
 * 기존 워크플로우(upload route)에서 OCR + 이미지 추출을 동시 실행할 때 사용.
 *
 * @example
 * ```ts
 * const [ocrResult, imageResult] = await Promise.all([
 *   processDocument(buffer, fileName, onProgress),
 *   extractDocumentImages(buffer, fileName, { subject: 'physics' }),
 * ]);
 * ```
 */
export async function processDocumentWithImages(
  fileBuffer: ArrayBuffer,
  fileName: string,
  options: {
    subject?: DiagramSubject;
    sourceName?: string;
    uploadToSupabase?: boolean;
    onProgress?: (progress: number) => void;
  } = {}
) {
  // 동적 import로 순환 참조 방지
  const { processDocument } = await import('@/lib/workflow/cloud-flow');

  const [ocrResult, imageResult] = await Promise.all([
    processDocument(fileBuffer, fileName, options.onProgress),
    extractDocumentImages(fileBuffer, fileName, {
      subject: options.subject,
      sourceName: options.sourceName,
      uploadToSupabase: options.uploadToSupabase,
    }),
  ]);

  return { ocrResult, imageResult };
}
