/**
 * 시험지 제목에서 과목/학년/유형 자동 감지
 * 업로드 시 + 자동수정 시 공통 사용
 */

/**
 * 제목에서 과목 감지
 * 중학교: "중2-1 수학", "중3-2 수학" 등
 * 고등학교: "공통수학1", "수학I", "미적분" 등
 */
export function detectSubjectFromTitle(title: string): string {
  const t = title;

  // ── 과학 ──
  if (/공통과학1/.test(t)) return '공통과학1';
  if (/공통과학2/.test(t)) return '공통과학2';
  if (/물리학?2/.test(t)) return '물리학2';
  if (/물리/.test(t)) return '물리학1';
  if (/화학2/.test(t)) return '화학2';
  if (/화학/.test(t)) return '화학1';
  if (/생명과학2|생물2/.test(t)) return '생명과학2';
  if (/생명|생물/.test(t)) return '생명과학1';
  if (/지구과학2/.test(t)) return '지구과학2';
  if (/지구/.test(t)) return '지구과학1';
  if (/과학/.test(t)) return '공통과학1';

  // ── 고등 수학 (명시적 과목명) ──
  if (/공통수학1/.test(t)) return '공통수학1';
  if (/공통수학2/.test(t)) return '공통수학2';
  if (/미적분/.test(t)) return '미적분';
  if (/확률과\s*통계|확통/.test(t)) return '확률과통계';
  if (/기하/.test(t)) return '기하';
  if (/수학?\s*[IⅠ](?!I)|수[학]?\s*1(?!\d)/.test(t)) return '수학I';
  if (/수학?\s*[IⅡ]{2}|수[학]?\s*2(?!\d)/.test(t)) return '수학II';
  if (/수학\s*\(\s*[상하]\s*\)/.test(t)) return '공통수학1';

  // ── 중학교: 제목에서 학년+학기 추출 ──
  // 패턴1: "중 2-1", "중2-1", "중학교 2학년 1학기"
  // 패턴2: "[2-1-M]" (2학년-1학기-중간)
  // 패턴3: "중2 1학기", "중3 2학기"
  const isMiddle = /중학교|[가-힣]중(?!\d*학년.*고)|중\d/.test(t);
  if (isMiddle) {
    let grade = 0;
    let semester = 0;

    // "2-1" 패턴 (학년-학기)
    const dashMatch = t.match(/(\d)\s*-\s*([12])/);
    if (dashMatch) {
      grade = parseInt(dashMatch[1]);
      semester = parseInt(dashMatch[2]);
    }

    // "중2", "중3" 등에서 학년
    if (!grade) {
      const gradeMatch = t.match(/중\s*(\d)/);
      if (gradeMatch) grade = parseInt(gradeMatch[1]);
    }

    // "2학년", "3학년" 등
    if (!grade) {
      const gradeMatch2 = t.match(/(\d)\s*학년/);
      if (gradeMatch2) grade = parseInt(gradeMatch2[1]);
    }

    // "1학기", "2학기"
    if (!semester) {
      const semMatch = t.match(/([12])\s*학기/);
      if (semMatch) semester = parseInt(semMatch[1]);
    }

    // 중간/기말로 학기 추정
    if (!semester) {
      semester = 1; // 기본값
    }

    if (grade >= 1 && grade <= 3) {
      return `중${grade}-${semester} 수학`;
    }
    return '중등 수학';
  }

  // ── 고등학교 기본값: 학년으로 추정 ──
  if (/고3|3학년/.test(t)) return '수학I'; // 고3은 수1이 일반적
  if (/고2|2학년/.test(t)) return '공통수학2'; // 고2는 공통수학2
  return '공통수학1'; // 고1 기본값
}

/**
 * 제목에서 학년 감지
 */
export function detectGradeFromTitle(title: string): string {
  const t = title;

  // 중학교
  if (/중\s*1|1학년.*중학/.test(t)) return '중1';
  const midMatch = t.match(/중\s*(\d)|(\d)\s*-\s*\d.*중|(\d)학년.*중학/);
  if (midMatch) {
    const g = midMatch[1] || midMatch[2] || midMatch[3];
    if (g && parseInt(g) >= 1 && parseInt(g) <= 3) return `중${g}`;
  }
  // "2-1" 패턴 + 중학교 맥락
  const isMiddle = /중학교|[가-힣]중(?!\d*학년.*고)|중\d/.test(t);
  if (isMiddle) {
    const dashMatch = t.match(/(\d)\s*-\s*[12]/);
    if (dashMatch) return `중${dashMatch[1]}`;
  }

  // 고등학교
  if (/고3|3학년(?!.*중)/.test(t)) return '고3';
  if (/고2|2학년(?!.*중)/.test(t)) return '고2';
  if (/고1|1학년(?!.*중)/.test(t)) return '고1';

  return '고1';
}

/**
 * 제목에서 시험 유형 감지
 */
export function detectExamTypeFromTitle(title: string): string {
  if (/모의고사|모의|평가원|수능/.test(title)) return '모의고사';
  return '학교기출';
}
