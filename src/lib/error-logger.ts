/**
 * 렌더링 에러 자동 수집 — 같은 버그 반복 수정 방지
 * rendering_errors 테이블에 실패 케이스를 자동 저장
 */

type ErrorType = 'katex' | 'figure' | 'ocr' | 'table' | 'displaystyle' | 'bracket' | 'label';

interface RenderingError {
  problemId?: string;
  errorType: ErrorType;
  errorDetail: string;
  rawInput?: string;
  correction?: string;
  metadata?: Record<string, unknown>;
}

// 클라이언트 사이드: API를 통해 로깅
export async function logRenderingError(error: RenderingError): Promise<void> {
  try {
    await fetch('/api/rendering-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error),
    });
  } catch {
    // 로깅 실패는 무시 (메인 기능에 영향 없도록)
    console.warn('[ErrorLogger] 로깅 실패:', error.errorType, error.errorDetail?.substring(0, 100));
  }
}

// 중복 방지: 같은 에러를 짧은 시간에 반복 로깅하지 않음
const recentErrors = new Map<string, number>();
const DEDUP_INTERVAL = 60_000; // 1분

export function logRenderingErrorDedup(error: RenderingError): void {
  const key = `${error.errorType}:${error.errorDetail?.substring(0, 50)}`;
  const now = Date.now();
  const last = recentErrors.get(key);
  if (last && now - last < DEDUP_INTERVAL) return;
  recentErrors.set(key, now);

  // 오래된 키 정리
  if (recentErrors.size > 100) {
    for (const [k, v] of recentErrors) {
      if (now - v > DEDUP_INTERVAL * 5) recentErrors.delete(k);
    }
  }

  logRenderingError(error);
}
