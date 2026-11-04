// ============================================================================
// Exam Meta Extractor — exams.title 에서 학기·시험구분 파싱
// 예: "26-3-1-M-동백중 수학"        → semester=1, examType="중간"
//     "26 경남고 기하 1학기 중간"    → semester=1, examType="중간"
//     "21년 3월 고1 모의고사(과학)"  → semester=null, examType="모의고사"
//     "[25-1-2-F] 해운대고 대수"     → semester=2, examType="기말"   (2026-11-04 보강)
//
// ★ 2026-11-04: 약식 코드(YY-G-S-T)를 본문 텍스트보다 먼저 본다.
//   종전엔 "25-1-2-F … 1학기 범위 복습" 이 1학기, "25-1-2-F … 중간범위 포함" 이 중간으로 읽혔다.
//   코드는 사람이 붙인 확정 표기라 더 믿을 만하다.
// ============================================================================

export type Semester = 1 | 2 | null;
export type ExamType = '중간' | '기말' | '모의고사' | '수행평가' | '서술형' | null;

/** "YY-G-S-T" 약식 코드. 제목 어디에 있어도, 대괄호 안이어도, 소문자여도 읽는다. 학년 1~6. */
const CODE_RE = /(?:^|[\s\[(])(\d{2})[-_.]([1-6])[-_.]([12])[-_.]([FfMm])(?=$|[\s\]\)\-_.,])/;

export function parseExamCode(title: string | null | undefined): { year: number; grade: number; semester: 1 | 2; type: '중간' | '기말' } | null {
  if (!title) return null;
  const m = title.match(CODE_RE);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  return {
    year: yy <= 30 ? 2000 + yy : 1900 + yy,
    grade: parseInt(m[2], 10),
    semester: parseInt(m[3], 10) as 1 | 2,
    type: m[4].toUpperCase() === 'M' ? '중간' : '기말',
  };
}

/**
 * 시험지 제목에서 학기 추출.
 * 1) 약식 코드 "26-3-1-M" 의 세번째 숫자 (우선)
 * 2) 명시적 텍스트: "1학기", "2학기" ("학기말" 의 "기말" 은 학기 표기가 아님)
 */
export function extractSemester(title: string | null | undefined): Semester {
  if (!title) return null;
  const code = parseExamCode(title);
  if (code) return code.semester;
  // "수1 학기말" 의 1 은 과목 번호 — 숫자·한글 바로 뒤의 1/2 는 학기 아님
  if (/(?<![\d가-힣])1\s*학기/.test(title)) return 1;
  if (/(?<![\d가-힣])2\s*학기/.test(title)) return 2;
  return null;
}

/**
 * 시험지 제목에서 시험구분 추출.
 * 약식 코드(M=중간, F=기말) 우선 → 명시적 텍스트 fallback.
 */
export function extractExamType(title: string | null | undefined): ExamType {
  if (!title) return null;
  const code = parseExamCode(title);
  if (code) return code.type;
  if (/중간/.test(title)) return '중간';
  if (/기말/.test(title)) return '기말';
  if (/모의고사|모의|평가원|교육청|학력평가/.test(title)) return '모의고사';
  if (/수행평가|수행/.test(title)) return '수행평가';
  if (/서술형/.test(title)) return '서술형';
  return null;
}
