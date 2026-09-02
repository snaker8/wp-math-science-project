// ============================================================================
// 시험지 제목 → 학교 메타 (school_name / grade / semester / exam_round)
// ============================================================================
//
// 출제 화면의 **학교기출 탭**은 이 네 컬럼으로 좁혀 들어간다
// (학교급 → 학년·학기 → 학교 → 회차). 컬럼이 비면 그 시험지는 탭에서 안 보인다.
//
// ★ 사고 (2026-09-02): `createExamFromHml` 이 이 컬럼들을 아예 안 채워서,
//   적재한 1,741건 중 학교명이 있는 건 40건뿐이었다. 화면 업로드도 마찬가지였다.
//   제목에 값이 다 들어 있으므로 여기서 파생시킨다 — 호출처가 따로 넘길 필요 없다.
//
// ★ 학교기출이 아닌 제목(진단평가·모의고사·교재·단원별)은 반드시 null 이 나와야 한다.
//   억지로 학교명을 만들어 붙이면 학교기출 탭이 오염된다. 확실할 때만 값을 만든다.

export interface ExamTitleMeta {
  schoolName: string;
  /** 학교급을 학교명으로 판정 못 하면 null — 억지로 넣지 않는다 */
  grade: string | null;
  semester: number;
  examRound: '중간' | '기말';
  /** 4자리 연도. 제목의 2자리를 2000년대로 편다 (`25` → 2025). */
  examYear: number;
  /** 학년 숫자만 (1~3). 학교급이 안 붙은 순수 학년 — 중복 판정에 쓴다. */
  gradeNum: number;
}

/**
 * 지원 형식
 *   (A) `25-1-2-M 신도중 수학`  ·  `26-2-1-M-동백중 수학`
 *       연도-학년-학기-M/F + 학교명. ★ 구분자는 공백과 하이픈 둘 다 온다
 *       (일괄 적재는 공백, 화면 업로드는 하이픈으로 들어온 실적이 있다).
 *   (B) `[22년][1-1][기말][해운대고][수학상]`
 */
export function parseExamTitleMeta(title: string): ExamTitleMeta | null {
  let gradeNum: number, semester: number, roundCode: string, schoolName: string, yy: number;

  const a = title.match(/^(\d{2})-(\d)-(\d)-([MF])[\s-]+([^\s-]+)/);
  const b = title.match(/^\[(\d{2})년\]\[(\d)-(\d)\]\[(중간|기말)\]\[([^\]]+)\]/);

  if (a) {
    [yy, gradeNum, semester, roundCode, schoolName] =
      [Number(a[1]), Number(a[2]), Number(a[3]), a[4], a[5]];
  } else if (b) {
    [yy, gradeNum, semester, roundCode, schoolName] =
      [Number(b[1]), Number(b[2]), Number(b[3]), b[4], b[5]];
  } else {
    return null;
  }

  if (gradeNum < 1 || gradeNum > 3 || semester < 1 || semester > 2) return null;

  const examRound: '중간' | '기말' =
    roundCode === 'M' || roundCode === '중간' ? '중간' : '기말';

  // 학교명에 과목이 대괄호로 붙어 오는 경우 — `청운고[대수]` → `청운고`
  schoolName = schoolName.replace(/[[(].*$/, '').trim();
  if (!schoolName) return null;

  // 학교급은 학교명 끝 글자로 본다. 판정 못 하면 grade 를 비운다.
  let grade: string | null = null;
  if (/중(학교)?$/.test(schoolName)) grade = `중${gradeNum}`;
  else if (/고(등학교)?$/.test(schoolName)) grade = `고${gradeNum}`;

  return { schoolName, grade, semester, examRound, examYear: 2000 + yy, gradeNum };
}
