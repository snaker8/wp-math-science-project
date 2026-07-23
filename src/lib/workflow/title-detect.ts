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
 * 중학교 "신호" — 학교명이 아닌 곳에서 중등 여부를 판단할 때 쓴다.
 *
 * ★ 맨 '중' 한 글자로 판단하면 안 된다 (2026-07-23 사고).
 *   `[23년][1-1][중간][해운대고][수학상]` 은 해운대고 수학(상), 즉 고1 시험지인데
 *   **"중간"(중간고사)의 '중'** 이 중학교 신호로 잡혀 `[1-1]` 을 중1-1 로 해석 →
 *   subject='중1-1 수학', grade='중1' 로 박히고, 그 값이 분류 프롬프트로 흘러
 *   집합·역함수·합성함수 문제가 전부 중1-1 유형으로 분류됐다.
 *   같은 학교 `[기말]` 시험지는 '중' 이 없어 정상이었던 것이 결정적 단서.
 */
const MIDDLE_MARKER = /중\s*[1-3]|중등|중학|중\]/;

/**
 * 고등학교 이름 패턴 — "해운대고", "부산고", "OO고등학교".
 * ★ "중간고사" 의 '고' 를 학교로 오인하지 않도록 뒤가 한글이면 제외한다.
 *   (학교명은 보통 대괄호·공백·문자열 끝이 뒤따른다)
 */
export const HIGH_SCHOOL_PATTERN = /[가-힣]{2,6}고(?:등학교)?(?=[\]\[\s)(·,]|$)/;

/**
 * 제목에서 수학 과목 감지
 * 반환값 예: '공통수학1', '수학II', '중3-1 수학', '중등 수학', ''
 */
export function detectSubjectFromTitle(title: string): string {
  if (!title) return '';
  // ★ Mac(NFD) 제목/파일명 정규화 — 맥 한글은 NFD(자모 분해)라 /중/·/수학/ 등 NFC 정규식이
  //   전부 false → 과목 오감지(맥에서만, 같은 파일 윈도우 정상). NFC 는 윈도우 문자열엔 무변화(멱등).
  title = title.normalize('NFC');

  // ★ 중학교 이름 감지: "사직중", "여명중", "OO중학교" 등
  // "고등학교"·고교명("해운대고")이 있으면 중학교 아님
  const hasHighSchool = /고등학교|고등/.test(title) || HIGH_SCHOOL_PATTERN.test(title);
  const isMiddleSchool = !hasHighSchool && MIDDLE_SCHOOL_PATTERN.test(title);

  // ★ 중등 — [2026][2-1-M] 패턴 (각각 별개 괄호)
  //   학년 1~3, 학기 1~2 로 제한
  const bracketMatch = title.match(/\[\d{4}\]\s*\[([1-3])-([12])-?([ME])?\]/);
  if (bracketMatch) {
    const grade = bracketMatch[1];
    const semester = bracketMatch[2];
    return `중${grade}-${semester} 수학`;
  }

  // ★ 중등 — "[2-1-M]", "26-3-1-M", "3-1-M" 패턴
  //   기존 (\d)-(\d) 는 "26-3-1" 같은 문자열에서 "6-3" 을 먼저 잡는 버그
  //   → 학년은 [1-3], 학기는 [12] 로 제한 + 좌우 비-숫자 경계로 격리
  const midMatch = title.match(/(?<!\d)([1-3])-([12])(?:-?[ME])?(?!\d)/);
  // ★ 맨 '중' 이 아니라 MIDDLE_MARKER — "중간"(중간고사)을 중학교로 읽던 사고 차단
  if (midMatch && !hasHighSchool && (isMiddleSchool || MIDDLE_MARKER.test(title))) {
    const grade = midMatch[1];
    const semester = midMatch[2];
    return `중${grade}-${semester} 수학`;
  }

  // 중등 — "중2-1", "중3", "중학" 등 직접 패턴 (고교명이 있으면 건너뜀)
  if (!hasHighSchool && (/중[23]?-?[12]/.test(title) || /중학/.test(title) || /중\]/.test(title))) {
    const match = title.match(/(?<!\d)([1-3])-([12])(?!\d)/);
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
  // ★ 괄호 없는 "수학상"·"수학 상" 도 인정 — 운영 제목 `[수학상]` 이 괄호 없이 쓰인다.
  //   뒤에 한글이 오면 제외("수학상수" 같은 단어 오인 방지).
  if (/수학\s*\(\s*상\s*\)|수학\s*상(?![가-힣])/.test(title)) return '공통수학1'; // 수학(상) = 공통수학1+2 범위 → 07로 매핑, 08도 COMBINED로 포함
  if (/수학\s*\(\s*하\s*\)|수학\s*하(?![가-힣])/.test(title)) return '공통수학2'; // 수학(하) = 공통수학2 범위 → 08로 매핑
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
  title = title.normalize('NFC'); // ★ Mac(NFD) 정규화 — 윈도우(NFC)는 무변화(멱등)

  // ★ 중학교 이름 감지 ("고등학교"·고교명 있으면 제외)
  const hasHighSchool = /고등학교|고등/.test(title) || HIGH_SCHOOL_PATTERN.test(title);
  const isMiddleSchool = !hasHighSchool && MIDDLE_SCHOOL_PATTERN.test(title);

  // ★ [2026][2-1-M] 패턴 (학년 1~3, 학기 1~2 제한)
  const bracketMatch = title.match(/\[\d{4}\]\s*\[([1-3])-([12])-?([ME])?\]/);
  if (bracketMatch) {
    return `중${bracketMatch[1]}`;
  }

  // ★ [2-1-M], "26-3-1-M" 등 — "26"의 6-3 매치 버그 차단
  //   학년 [1-3] · 학기 [12] · 좌우 비-숫자 경계
  const midMatch = title.match(/(?<!\d)([1-3])-([12])(?:-?[ME])?(?!\d)/);
  // ★ 맨 '중' 이 아니라 MIDDLE_MARKER — "중간"(중간고사) 오인 차단 (detectSubjectFromTitle 과 동일)
  if (midMatch && !hasHighSchool && (isMiddleSchool || MIDDLE_MARKER.test(title))) {
    return `중${midMatch[1]}`;
  }

  if (!hasHighSchool) {
    if (/중1/.test(title)) return '중1';
    if (/중2/.test(title)) return '중2';
    if (/중3/.test(title)) return '중3';
  }

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

  // 고교명·"고등학교"가 제목에 있으면 학년 추출
  if (hasHighSchool) {
    const gradeMatch = title.match(/(\d)\s*학년/);
    if (gradeMatch) return `고${gradeMatch[1]}`;
    // ★ `[23년][1-1][중간][해운대고]` 처럼 고교명 + 학년-학기 표기 → 고1
    const gs = title.match(/(?<!\d)([1-3])-([12])(?:-?[ME])?(?!\d)/);
    if (gs) return `고${gs[1]}`;
  }

  // 과목명으로 학년 추론 (명시적 학년 없을 때) — 괄호 없는 "수학상" 포함
  if (/공통수학|수학\s*\(?\s*[상하]\s*\)?(?![가-힣])/.test(title)) return '고1';

  // ★ 고2: 수학I, 수학II, 대수, 확률과통계 — 모두 고2 소속 (축약형 "수1"/"수2" 포함)
  //   "수2" 단독 표기가 "수학[2IⅡ]" 정규식에 안 잡혀 exam.grade 기본값이 쓰이던 버그 수정.
  if (
    /수학(?:Ⅰ|I|1|Ⅱ|II|2)(?!\d)/.test(title) ||
    /(?<!수학)수(?:Ⅰ|I|1|Ⅱ|II|2)(?=\s|$|학기|\d|중간|기말|-)/.test(title) ||
    /대수(?!학)/.test(title) ||
    /확률\s*(?:과|와)?\s*통계|확통/.test(title)
  ) return '고2';

  // 고3: 미적분, 기하 (선택 과목)
  if (/미적분[12]?|기하(?!학)/.test(title)) return '고3';

  return '';
}

// ============================================================================
// 진단지 메타 자동 인식 — 자산화 시 제목 패턴 매치하여 exam 컬럼 채우기
//
// 지원 패턴:
//   BS_M1_R1, BS_M2_R3, BS_M3_R1 (광역 스캔, 라운드 필수)
//   BS_H1_R1, BS_H2_R2 (고등도 동일)
//   DD_M2_연립방정식, DD_M3_이차함수 (정밀 진단, 라운드 보통 없음)
//   PT_M2_*, PT_M3_* (선수 추적)
//   SC_M2_*, SC_M3_* (스팟체크)
//
//   접미사 자유: "BS_M1_R1 (중1 과정)", "BS_M1_R1_240425", "BS_M1_R1.pdf"
//   대소문자 자유: 패턴은 대문자 BS/DD/PT/SC 우선이지만 소문자도 인식
//
// 임선생님 운영 컨벤션 (BS R1=하, R2=중하, R3=중) 은 자동 추론하지 않음.
// 난이도 표기가 제목에 명시 없으면 NULL 유지 → 모달에서 수동 입력.
// ============================================================================

export interface DiagnosticMeta {
  is_diagnostic: boolean;
  diagnostic_category: 'BS' | 'DD' | 'PT' | 'SC' | null;
  diagnostic_round: string | null;          // 'R1' / 'R2' / ... (BS 만 보통 채워짐)
  diagnostic_difficulty: string | null;      // 보통 NULL
}

const EMPTY_DIAG: DiagnosticMeta = {
  is_diagnostic: false,
  diagnostic_category: null,
  diagnostic_round: null,
  diagnostic_difficulty: null,
};

// 메인 매처:
//   BS_M1_R1, BS_H1_R2, BS_M1S1_R2, BS_H1S1_R2 (공통수학1 과정), DD_M2_연립방정식, PT_*, SC_*
//   학년 코드 = M1~M3 / H1~H3, 학기 suffix S1/S2 선택, _R숫자 선택.
//
// ★ \b 대신 lookbehind/lookahead 사용 — underscore(_) 가 \w 에 포함되어
//   `260504_BS_H1S1_R1` 처럼 _BS_ 가 word boundary 매치 실패 사고 (2026-05-16).
//   사용자 보고: "오늘 진단평가 더올렸는데 안보인다" → 자동 태깅 누락 원인.
const DIAG_PATTERN = /(?<![A-Za-z0-9])(BS|DD|PT|SC)_[MH][1-3](?:S[12])?(?:_R(\d{1,2}))?(?![A-Za-z0-9])/i;

// 난이도 명시 키워드 (제목 어딘가에 있으면 채움)
const DIFFICULTY_KEYWORDS: Array<{ key: RegExp; value: string }> = [
  { key: /\b(?:최상|최고난이도)\b/, value: '최상' },
  { key: /\b상\b(?!류|위)/, value: '상' },
  { key: /\b중하\b/, value: '중하' },
  { key: /\b중\b(?!학|간|등|급|요)/, value: '중' },
  { key: /\b하\b(?!급|류|단|위)/, value: '하' },
];

/**
 * 시험지 제목에서 진단지 메타 추출.
 * 패턴 매치 안 되면 {is_diagnostic: false, ...nulls} 반환.
 */
export function detectDiagnosticMetaFromTitle(title: string): DiagnosticMeta {
  if (!title) return EMPTY_DIAG;
  title = title.normalize('NFC'); // ★ Mac(NFD) 정규화 — 윈도우(NFC)는 무변화(멱등)

  const m = title.match(DIAG_PATTERN);
  if (!m) return EMPTY_DIAG;

  const category = m[1].toUpperCase() as 'BS' | 'DD' | 'PT' | 'SC';
  const roundNum = m[2];

  // 난이도 — 제목에 명시 키워드 있으면 채움
  let difficulty: string | null = null;
  for (const { key, value } of DIFFICULTY_KEYWORDS) {
    if (key.test(title)) {
      difficulty = value;
      break;
    }
  }

  return {
    is_diagnostic: true,
    diagnostic_category: category,
    diagnostic_round: roundNum ? `R${roundNum}` : null,
    diagnostic_difficulty: difficulty,
  };
}
