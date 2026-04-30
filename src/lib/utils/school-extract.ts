// ============================================================================
// School Name Extractor — exams.title에서 학교명 자동 추출
// 예: "26 신곡중 3-1 중간" → "신곡중"
//     "21 경남여고 수2 1학기 중간" → "경남여고"
//     "23-2-1-M 사직여중 수학" → "사직여중"
// ============================================================================

/**
 * 시험지 제목에서 학교명 추출.
 * 못 찾으면 null 반환.
 */
export function extractSchoolName(title: string): string | null {
  if (!title) return null;

  // 학교 접미사 후보: 중, 고, 초, 중학교, 고등학교, 초등학교, 여중, 여고, 남중, 남고
  // 한글 1~6자 + 접미사 패턴
  const patterns = [
    /([가-힣]{1,6}(?:여중|남중|여고|남고))/,
    /([가-힣]{1,6}(?:중학교|고등학교|초등학교))/,
    /([가-힣]{1,6}(?:중|고|초))(?=[\s\-_])/, // 단음절 접미사 — 단어 경계 확인
    /([가-힣]{1,6}(?:중|고|초))$/, // 끝에 위치
  ];

  for (const re of patterns) {
    const m = title.match(re);
    if (m && m[1]) {
      // 단순 단어 ('중', '고', '초') 단독은 거름
      if (m[1].length < 2) continue;
      return m[1];
    }
  }
  return null;
}

/**
 * 학교 분류 — '중학교' / '고등학교' / '초등학교' / '미분류'
 */
export function classifySchoolLevel(school: string | null): '초' | '중' | '고' | '대' | '미분류' {
  if (!school) return '미분류';
  if (school.startsWith('초') || school.includes('초등') || /초$/.test(school)) return '초';
  if (school.includes('중학교') || /(?:여중|남중|중)$/.test(school)) return '중';
  if (school.includes('고등학교') || /(?:여고|남고|고)$/.test(school)) return '고';
  if (school.includes('대학교') || /대$/.test(school)) return '대';
  return '미분류';
}
