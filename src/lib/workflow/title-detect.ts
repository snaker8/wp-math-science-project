// ============================================================================
// 시험지 제목/파일명에서 과목·학년 감지 — auto-fix, cloud-flow 둘 다 사용
//
// 여기 있는 함수들은 auto-fix/route.ts에서 추출된 것 — 이전엔 auto-fix 내부
// 함수였는데 cloud-flow 1차에서도 같은 로직이 필요해서 공용화.
// ============================================================================

// 중학교 이름 패턴 (학교명에 "중"이 들어가면 중학교)
// ★ "중간", "중심" 등 비학교명 제외, "고등학교"가 있으면 중학교 아님
export const MIDDLE_SCHOOL_PATTERN = /[가-힣]{1,6}중(?:학교)?(?!\d)(?!간|심|요)/;

/**
 * 제목에서 수학 과목 감지
 * 반환값 예: '공통수학1', '수학II', '중3-1 수학', '중등 수학', ''
 */
export function detectSubjectFromTitle(title: string): string {
  if (!title) return '';

  // ★ 중학교 이름 감지: "사직중", "여명중", "OO중학교" 등
  // "고등학교"가 명시되어 있으면 중학교 아님
  const hasHighSchool = /고등학교|고등/.test(title);
  const isMiddleSchool = !hasHighSchool && MIDDLE_SCHOOL_PATTERN.test(title);

  // ★ 중등 — [2026][2-1-M] 패턴 (각각 별개 괄호)
  const bracketMatch = title.match(/\[\d{4}\]\s*\[(\d)-(\d)-?([ME])?\]/);
  if (bracketMatch) {
    const grade = bracketMatch[1];
    const semester = bracketMatch[2];
    return `중${grade}-${semester} 수학`;
  }

  // 중등 — [2-1-M] 또는 [3-1-M] 패턴, "중" 글자 포함
  const midMatch = title.match(/\[?(\d)-(\d)-?[ME]?\]?/);
  if (midMatch && (isMiddleSchool || /중/.test(title) || parseInt(midMatch[1]) <= 3)) {
    const grade = midMatch[1];
    const semester = midMatch[2];
    return `중${grade}-${semester} 수학`;
  }

  // 중등 — "중2-1", "중3", "중학" 등 직접 패턴
  if (/중[23]?-?[12]/.test(title) || /중학/.test(title) || /중\]/.test(title)) {
    const match = title.match(/(\d)-(\d)/);
    if (match) return `중${match[1]}-${match[2]} 수학`;
    return '중등 수학';
  }

  // ★ 학교명에 "중"이 있고 학년-학기 패턴이 있으면 중등
  if (isMiddleSchool) {
    const gsMatch = title.match(/(\d)-(\d)/);
    if (gsMatch) return `중${gsMatch[1]}-${gsMatch[2]} 수학`;
    // 학년만 있는 경우
    const gradeOnly = title.match(/(\d)\s*학년/);
    if (gradeOnly) return `중${gradeOnly[1]}-1 수학`;
    return '중등 수학';
  }

  // 고등 — 수학(상/하) 먼저 체크 (2015 교육과정)
  if (/수학\s*\(상\)/.test(title)) return '공통수학1'; // 수학(상) = 공통수학1+2 범위 → 07로 매핑, 08도 COMBINED로 포함
  if (/수학\s*\(하\)/.test(title)) return '공통수학2'; // 수학(하) = 공통수학2 범위 → 08로 매핑
  if (/공통수학[12]/.test(title)) return title.match(/공통수학[12]/)?.[0] || '공통수학1';
  if (/공통수학/.test(title)) return '공통수학1';
  if (/대수/.test(title)) return '대수';
  if (/미적분[12]/.test(title)) return title.match(/미적분[12]/)?.[0] || '미적분1';
  if (/미적분/.test(title)) return '미적분'; // 구 교육과정 미적분 → code 12
  if (/확률.*통계|확통/.test(title)) return '확률과통계';
  if (/기하/.test(title)) return '기하';
  // 구 수학I = 대수(09), 구 수학II = 미적분1(10)
  // ★ 수학II 먼저 체크 — "수학II"의 첫 I가 [1IⅠ]에 매칭돼서 수학I로 오분류되는 버그 방지
  //    Ⅱ(\u2161 단일문자), II(I 두 개), 2 모두 처리
  if (/수학(?:Ⅱ|II|2)(?!\d)/.test(title) || /수(?:Ⅱ|II|2)\b/.test(title)) return '수학II';
  if (/수학(?:Ⅰ|I|1)(?!\d|I|Ⅰ)/.test(title) || /수(?:Ⅰ|I|1)\b(?!I|Ⅰ)/.test(title)) return '수학I';

  // 과학
  if (/과학|물리|화학|생명|생물|지구/.test(title)) {
    if (/공통과학1|통합과학/.test(title)) return '공통과학1';
    if (/물리/.test(title)) return '물리학1';
    if (/화학/.test(title)) return '화학1';
    if (/생명|생물/.test(title)) return '생명과학1';
    if (/지구/.test(title)) return '지구과학1';
    return '공통과학1';
  }
  return '';
}

/**
 * 제목에서 학년 감지
 * 반환값 예: '중3', '고1', '고2', '고3', ''
 */
export function detectGradeFromTitle(title: string): string {
  if (!title) return '';

  // ★ 중학교 이름 감지 ("고등학교" 있으면 제외)
  const hasHighSchool = /고등학교|고등/.test(title);
  const isMiddleSchool = !hasHighSchool && MIDDLE_SCHOOL_PATTERN.test(title);

  // ★ [2026][2-1-M] 패턴
  const bracketMatch = title.match(/\[\d{4}\]\s*\[(\d)-(\d)-?([ME])?\]/);
  if (bracketMatch) {
    return `중${bracketMatch[1]}`;
  }

  // [2-1-M] 패턴 + "중" 글자
  const midMatch = title.match(/\[?(\d)-(\d)-?[ME]?\]?/);
  if (midMatch && (isMiddleSchool || /중/.test(title) || parseInt(midMatch[1]) <= 3)) {
    return `중${midMatch[1]}`;
  }

  if (/중1/.test(title)) return '중1';
  if (/중2/.test(title)) return '중2';
  if (/중3/.test(title)) return '중3';

  // ★ 학교명에 "중"이 있으면 중학교 → 학년 추출 시도
  if (isMiddleSchool) {
    const gradeMatch = title.match(/(\d)\s*학년/) || title.match(/(\d)-(\d)/);
    if (gradeMatch) return `중${gradeMatch[1]}`;
    return '중2'; // 중학교인데 학년 불명 → 기본값 중2
  }

  // 명시적 학년 패턴: "고1 ", "고2 " (뒤에 공백/숫자/한글이 와야 함 — "고" 단독 매칭 방지)
  if (/고1(?:\s|$|학년)/.test(title)) return '고1';
  if (/고2(?:\s|$|학년)/.test(title)) return '고2';
  if (/고3(?:\s|$|학년)/.test(title)) return '고3';

  // "고등학교"가 제목에 있으면 학년 추출
  if (/고등학교|고등/.test(title)) {
    const gradeMatch = title.match(/(\d)\s*학년/);
    if (gradeMatch) return `고${gradeMatch[1]}`;
  }

  // 과목명으로 학년 추론 (명시적 학년 없을 때)
  if (/공통수학|수학\s*\(상\)|수학\s*\(하\)/.test(title)) return '고1';
  if (/수학[1IⅠ](?!\d)|대수|확률.*통계|확통/.test(title)) return '고2';
  if (/수학[2IⅡ](?!\d)|미적분|기하/.test(title)) return '고3';

  return '';
}
