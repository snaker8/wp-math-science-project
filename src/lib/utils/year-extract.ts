// ============================================================================
// Exam Year Extractor — 시험지 title 또는 created_at에서 발행 년도 추출
// 예: "26 신곡중 3-1 중간"        → 2026
//     "21 경남여고 수2 1학기 중간" → 2021
//     "23-2-1-M 사직여중 수학"     → 2023
//     "2024 동백중 ..."            → 2024
//     "[22년][1-1][기말][해운대고]" → 2022   (2026-11-04 보강)
//     fallback: created_at의 ISO 년도
//
// ★ 2026-11-04 우선순위 변경: 제목 맨 앞의 YY 코드 → "YY년" → 4자리 → created_at.
//   종전엔 4자리를 제목 어디서든 먼저 찾아 "26 신곡중 2022개정" 이 2022 가 됐다.
// ============================================================================

import { parseExamCode } from './exam-meta-extract';

const toFullYear = (yy: number) => (yy <= 30 ? 2000 + yy : 1900 + yy);

/** 제목만으로 년도. 못 찾으면 null (created_at 추정 없음). */
export function extractExamYearFromTitle(title: string | null | undefined): number | null {
  if (!title) return null;
  // 1) "YY-G-S-T" 약식 코드 (대괄호·소문자 포함)
  const code = parseExamCode(title);
  if (code) return code.year;
  // 2) 맨 앞 "YY " / "YY-" / "[YY" / "YY_"
  const m2 = title.match(/^\s*\[?(\d{2})(?:[-\s_년\]])/);
  if (m2) return toFullYear(parseInt(m2[1], 10));
  // 3) "YY년" 어디서든 (예: "[22년][1-1]")
  const mY = title.match(/(?<!\d)(\d{2})년/);
  if (mY) return toFullYear(parseInt(mY[1], 10));
  // 4) 4자리 "20YY" (개정 교육과정 표기 "2022개정" 은 제외)
  const m4 = title.match(/(?<!\d)(20\d{2})(?!\d|\s*개정)/);
  if (m4) return parseInt(m4[1], 10);
  return null;
}

/**
 * 시험지 발행 년도를 추출. title 우선, 못 찾으면 created_at fallback, 둘 다 실패 시 null.
 */
export function extractExamYear(
  title: string | null | undefined,
  createdAt: string | null | undefined
): number | null {
  const fromTitle = extractExamYearFromTitle(title);
  if (fromTitle) return fromTitle;
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) return d.getFullYear();
  }
  return null;
}
