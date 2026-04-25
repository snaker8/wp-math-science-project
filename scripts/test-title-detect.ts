/**
 * detectSubjectFromTitle / detectGradeFromTitle 회귀 테스트.
 * 실행: npx tsx scripts/test-title-detect.ts
 */
import { detectSubjectFromTitle, detectGradeFromTitle } from '../src/lib/workflow/title-detect';

const cases: Array<{ title: string; subject?: string; grade?: string }> = [
  // ★ 이번에 고친 버그 ─────────────────────────────
  { title: '25 경남고 수2 1학기 중간',  subject: '수학II',   grade: '고2' },
  { title: '2025 경남고 수1 2학기 기말', subject: '수학I',    grade: '고2' },
  { title: '2024 ○○고 수학2 중간',     subject: '수학II',   grade: '고2' },
  { title: '대수 모의고사',               subject: '대수',     grade: '고2' },

  // 기존 동작 유지 ─────────────────────────────────
  { title: '2025 공통수학1 모의',        subject: '공통수학1', grade: '고1' },
  { title: '수학(상) 중간',               subject: '공통수학1', grade: '고1' },
  { title: '수학(하) 기말',               subject: '공통수학2', grade: '고1' },
  { title: '미적분 모의',                 subject: '미적분',   grade: '고3' },
  { title: '기하 시험',                   subject: '기하',     grade: '고3' },
  { title: '확률과 통계',                 subject: '확률과통계', grade: '고2' },

  // 중등
  { title: '[2026][2-1-M]',              subject: '중2-1 수학', grade: '중2' },
  { title: '사직중 3학년 기말',           subject: '중3-1 수학', grade: '중3' },

  // ★ "26-3-1-M 해강중" → 6-3 오매치 버그 회귀 케이스
  { title: '26-3-1-M 해강중 수학',       subject: '중3-1 수학', grade: '중3' },
  { title: '25-2-2-M 부산중 기말',       subject: '중2-2 수학', grade: '중2' },
  { title: '2025-3-1-M ○○중',           subject: '중3-1 수학', grade: '중3' },

  // 엣지 — "수" 뒤에 1/2가 아닌 글자
  { title: '고수 특강',                   grade: '' },  // 고수 = 학년 불명
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const s = detectSubjectFromTitle(c.title);
  const g = detectGradeFromTitle(c.title);
  const okS = c.subject === undefined || s === c.subject;
  const okG = c.grade === undefined || g === c.grade;
  if (okS && okG) {
    pass++;
    console.log(`✓ "${c.title}" → subject="${s}" grade="${g}"`);
  } else {
    fail++;
    console.log(`✗ "${c.title}"`);
    if (!okS) console.log(`  subject: expected "${c.subject}" got "${s}"`);
    if (!okG) console.log(`  grade:   expected "${c.grade}" got "${g}"`);
  }
}
console.log(`\n${pass} passed, ${fail} failed of ${cases.length}`);
process.exit(fail > 0 ? 1 : 0);
