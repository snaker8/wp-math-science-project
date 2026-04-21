// ============================================================================
// SVG sanitize 유틸 — dangerouslySetInnerHTML에 넣기 전 필수 검증
//
// 'use client' 컴포넌트에서만 호출되므로 브라우저 전용 DOMPurify 사용.
// 서버 컴포넌트에서 호출될 경우 window가 없어 no-op으로 작동 (원본 반환).
// ============================================================================

import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // script 차단은 기본값이지만 명시
  FORBID_TAGS: ['script', 'foreignObject'],
  FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover', 'onfocus', 'onunload'],
};

/**
 * SVG 문자열을 안전하게 정제한다.
 * - <script>, <foreignObject>, on* 속성 제거
 * - javascript: / data: URL 차단
 * - SVG + SVG 필터 엘리먼트만 허용
 *
 * 브라우저 전용: 서버 렌더 경로에서는 원본 반환 (FigureRenderer는 'use client'라 안전)
 */
export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return '';
  if (typeof window === 'undefined') {
    // 서버 렌더 중에는 sanitize 불가 (dompurify는 window 필요)
    // FigureRenderer는 'use client'라 실제로 이 분기에 거의 안 걸림.
    // 만약 걸리면 스크립트 태그만 기본 차단.
    return svg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript\s*:/gi, '');
  }
  try {
    return DOMPurify.sanitize(svg, SANITIZE_CONFIG) as string;
  } catch (err) {
    console.warn('[sanitizeSvg] 정제 실패, 빈 문자열 반환:', err);
    return '';
  }
}
