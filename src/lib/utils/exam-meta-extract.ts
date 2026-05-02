// ============================================================================
// Exam Meta Extractor — exams.title 에서 학기·시험구분 파싱
// 예: "26-3-1-M-동백중 수학"        → semester=1, examType="중간"
//     "26 경남고 기하 1학기 중간"    → semester=1, examType="중간"
//     "21년 3월 고1 모의고사(과학)"  → semester=null, examType="모의고사"
// ============================================================================

export type Semester = 1 | 2 | null;
export type ExamType = '중간' | '기말' | '모의고사' | '수행평가' | '서술형' | null;

/**
 * 시험지 제목에서 학기 추출.
 * 1) 명시적 텍스트: "1학기", "2학기"
 * 2) 약식 패턴: "26-3-1-M" 의 세번째 숫자
 */
export function extractSemester(title: string | null | undefined): Semester {
  if (!title) return null;
  // 1) 명시적
  if (/1\s*학기/.test(title)) return 1;
  if (/2\s*학기/.test(title)) return 2;
  // 2) 약식: "YY-G-S-T" → S 부분
  const m = title.match(/^\s*\d{2}-[1-3]-([12])-[A-Z]/);
  if (m) return parseInt(m[1], 10) as 1 | 2;
  return null;
}

/**
 * 시험지 제목에서 시험구분 추출.
 * 명시적 텍스트 우선 → 약식 코드(M=중간, F=기말) fallback.
 */
export function extractExamType(title: string | null | undefined): ExamType {
  if (!title) return null;
  // 명시적
  if (/중간/.test(title)) return '중간';
  if (/기말/.test(title)) return '기말';
  if (/모의고사|모의/.test(title)) return '모의고사';
  if (/수행평가|수행/.test(title)) return '수행평가';
  if (/서술형/.test(title)) return '서술형';
  // 약식: "YY-G-S-T" 의 T (M=중간, F=기말)
  const m = title.match(/^\s*\d{2}-[1-3]-[12]-([A-Z])/);
  if (m) {
    if (m[1] === 'M') return '중간';
    if (m[1] === 'F') return '기말';
  }
  return null;
}
