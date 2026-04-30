// ============================================================================
// Exam Year Extractor — 시험지 title 또는 created_at에서 발행 년도 추출
// 예: "26 신곡중 3-1 중간"        → 2026
//     "21 경남여고 수2 1학기 중간" → 2021
//     "23-2-1-M 사직여중 수학"     → 2023
//     "2024 동백중 ..."            → 2024
//     fallback: created_at의 ISO 년도
// ============================================================================

/**
 * 시험지 발행 년도를 추출. title 우선, 못 찾으면 created_at fallback, 둘 다 실패 시 null.
 */
export function extractExamYear(
  title: string | null | undefined,
  createdAt: string | null | undefined
): number | null {
  if (title) {
    // 1) "20YY" 또는 "YYYY" 4자리 직접 (먼저 시도 — 더 정확)
    const m4 = title.match(/(?<![\d])(20\d{2})(?![\d])/);
    if (m4) return parseInt(m4[1], 10);

    // 2) "YY ..." 또는 "YY-..." prefix (2자리 년도)
    const m2 = title.match(/^\s*(\d{2})(?:[-\s])/);
    if (m2) {
      const n = parseInt(m2[1], 10);
      // 00~30 → 2000~2030, 31~99 → 1931~1999 (학원 자료는 거의 다 2000년대)
      return n <= 30 ? 2000 + n : 1900 + n;
    }
  }

  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) return d.getFullYear();
  }

  return null;
}
