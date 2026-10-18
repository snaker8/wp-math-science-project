// ============================================================================
// School Name Normalizer — DB 저장용 표기 통일
//
// 정책:
//   "동래중학교" / "부산동래중" / "동래중" → 모두 "동래중" 로 통일
//   "경남여고등학교" → "경남여고"
//   동음이 학교(부산 동래중 vs 인천 동래중)는 district 로 분리. 이 함수는 학교명만.
//
// 사용처:
//   - exams.school_name INSERT 직전 (route.ts saveProblemsToDB / saveEditedProblemsDirect)
//   - exam-create 학교 필터 dropdown 데이터 정규화
// ============================================================================

/**
 * 학교명을 DB 저장용 표기로 통일.
 *  - "중학교"/"고등학교"/"초등학교" → "중"/"고"/"초"
 *  - "여중학교" → "여중", "남고등학교" → "남고"
 *  - 앞뒤 공백 / 시도 prefix 제거 (예: "부산 동래중" → "동래중", "서울동래중" → "동래중")
 *  - 너무 짧은 입력(2자 미만)은 null
 *  - 학교 접미사가 없으면 null (학교명이 아닌 자유 텍스트 차단)
 */
export function normalizeSchoolName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // 접미사 정규화
  const normalizeSuffix = (v: string) => v
    .replace(/여중학교$/, '여중')
    .replace(/남중학교$/, '남중')
    .replace(/여고등학교$/, '여고')
    .replace(/남고등학교$/, '남고')
    .replace(/중학교$/, '중')
    .replace(/고등학교$/, '고')
    .replace(/초등학교$/, '초')
    .trim();
  s = normalizeSuffix(s);

  // 시도/광역 prefix 제거 ("부산 동래중"·"서울동래중" → "동래중")
  // ★ 2026-10-18 경남외고 → "외고" 사고: 시도 이름이 학교명 자체인 경우(경남외고·경남고·부산고·서울고·경기고)는 떼면 안 된다.
  //   공백이 있으면 떼고, 붙어 있으면 뗀 뒤 접미사를 뺀 줄기가 2자 이상 남을 때만 뗀다 ("서울동래중" → "동래" ok, "경남외고" → "외" ✗).
  const SIDO = '(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)';
  const spaced = s.match(new RegExp(`^${SIDO}[ ]+(.+)$`));
  if (spaced) s = spaced[2].trim();
  else {
    const glued = s.match(new RegExp(`^${SIDO}(.+)$`));
    if (glued) {
      const stem = glued[2].replace(/(?:여중|남중|여고|남고|중|고|초)$/, '');
      if (stem.length >= 2) s = glued[2].trim();
    }
  }

  if (s.length < 2) return null;

  // 학교 접미사 확인 — 없으면 학교명이 아니라고 간주
  if (!/(?:여중|남중|여고|남고|중|고|초)$/.test(s)) return null;

  return s;
}

/**
 * 시도 + 시군구 → DB district 형식 ("부산 동래구").
 * 둘 다 비어있으면 null.
 */
export function normalizeDistrict(
  sido: string | null | undefined,
  sigungu: string | null | undefined
): string | null {
  const a = (sido || '').trim();
  const b = (sigungu || '').trim();
  if (!a && !b) return null;
  if (a && b) return `${a} ${b}`;
  return a || b || null;
}

/**
 * 학교명 + 년도 + 학기 + 회차 + 번호 → 카드 우측 출처 배지 텍스트.
 *   normalizeSourceLabel({ schoolName: '동래중', examYear: 2026, semester: 1, examRound: '단원집', number: 3 })
 *   // → "동래중 26·1 단원집 3"
 * 필드 누락 시 가능한 부분만 조합.
 */
export function formatSourceLabel(input: {
  schoolName?: string | null;
  examYear?: number | null;
  semester?: number | null;
  examRound?: string | null;
  number?: number | null;
}): string | null {
  const parts: string[] = [];
  if (input.schoolName) parts.push(input.schoolName);

  const yy = input.examYear ? String(input.examYear).slice(-2) : '';
  const sem = input.semester ? String(input.semester) : '';
  if (yy && sem) parts.push(`${yy}·${sem}`);
  else if (yy) parts.push(yy);

  if (input.examRound) parts.push(input.examRound);
  if (input.number) parts.push(String(input.number));

  if (parts.length === 0) return null;
  return parts.join(' ');
}
