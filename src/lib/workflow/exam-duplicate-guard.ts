// ============================================================================
// 시험지 중복 가드 — **제목이 달라도** 같은 시험이면 잡는다
// ============================================================================
//
// ★ 왜 필요한가 (2026-09-02 사고)
//   기존 가드(CLAUDE.md #1)는 `title + institute_id + book_group_id` 로만 봤다.
//   9/1 에 수학비서 .hml 을 다시 임포트하면서 **이미 자산화·분류가 끝난 중등 기출이
//   한 벌 더** 들어왔는데, 제목이 갈려서(`… 여명중 수학` vs `… 여명중 중등수학2상`)
//   가드를 그냥 통과했다. 시험지 37개·문항 773개가 중복으로 쌓였고, 그중 542문항이
//   분류 대기열에 들어가 AI 비용까지 낭비될 뻔했다.
//
// 판정 기준: **학교 · 연도 · 학년 · 학기 · 중간/기말** 다섯 개가 같으면 같은 시험이다.
//   한 학교의 한 학년이 같은 학기에 같은 회차 시험을 두 번 치지 않는다.
//   교과서명·과목 표기는 경로마다 달라지므로(파일명 유래) 판정에서 뺀다.
//
// 학교기출 형식이 아닌 제목(진단평가·모의고사·교재)은 `null` 이 나오고, 그때는
// 이 가드가 아무 말도 하지 않는다 — 기존 제목 기반 가드가 계속 담당한다.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseExamTitleMeta } from './exam-title-meta';

export interface ExamIdentity {
  schoolName: string;
  examYear: number;
  gradeNum: number;
  semester: number;
  examRound: '중간' | '기말';
  /**
   * 같은 학교·회차라도 **다른 시험지인 것**을 구분하는 꼬리표.
   *   `(유사)` 변형본, `A형`/`B형` 분리 출제 — 이걸 안 보면 정상 자료를 중복으로 막는다.
   *   해당 없으면 빈 문자열.
   */
  variant: string;
}

/**
 * 고등 과목 표기를 하나로 모은다 — 같은 과목의 다른 이름이 중복으로 안 잡히게.
 *   `공통수학1` = `수학상` = `수학(상)` (2022 개정 ↔ 옛 표기)
 * 중등은 학년·학기가 이미 과목을 특정하므로 토큰 없음('').
 * 못 알아보는 표기도 '' — 그때는 과목을 판정에서 빼고 나머지 다섯으로 본다.
 */
function subjectTokenOf(title: string): string {
  // 중등 교과서명(`중등수학2상`)은 과목이 아니라 학년 표기다. 남겨두면 `수학2`로 읽혀
  // 고2 `수학Ⅱ` 와 뒤섞인다 → 먼저 걷어낸다.
  const t = title.replace(/\s/g, '').replace(/중등수학\d[상하]?/g, '');

  // 순서가 곧 규칙이다 — 좁은 것부터. `고급대수` 를 `대수` 보다 먼저 보지 않으면
  // 현대청운고의 두 과목이 한 시험으로 뭉개진다 (실측).
  if (/고급대수/.test(t)) return 'ADV_AL';
  if (/고급수학/.test(t)) return 'ADV_M';
  if (/공통수학[1Ⅰ]/.test(t)) return 'CM1';
  if (/공통수학[2Ⅱ]/.test(t)) return 'CM2';
  if (/수학\(?상\)?/.test(t)) return 'CM1';
  if (/수학\(?하\)?/.test(t)) return 'CM2';
  // 고2 `수학Ⅰ`·`수학Ⅱ` — 경신고처럼 같은 학년·회차에 나란히 있다. 구분 못 하면
  // 정상 시험지를 중복으로 막는다 (실측 9쌍).
  if (/수학\(?[1Ⅰ]\)?/.test(t)) return 'M1';
  if (/수학\(?[2Ⅱ]\)?/.test(t)) return 'M2';
  if (/미적분[2Ⅱ]/.test(t)) return 'CAL2';
  if (/미적분/.test(t)) return 'CAL1';
  if (/확률과통계|확통/.test(t)) return 'PS';
  if (/기하/.test(t)) return 'GEO';
  if (/대수/.test(t)) return 'AL';
  return '';
}

/**
 * 제목 꼬리에서 "같은 회차라도 다른 시험지인 것" 표시를 뽑는다. 없으면 ''.
 *   ★ `(유사)` · `(유사1)` · `(유사2)` 는 **서로 다른 변형본**이다 — 번호까지 봐야 한다.
 *     번호를 버리면 정상 자료 3벌 중 2벌이 중복으로 막힌다 (실측: 고1 23-1-2 다수).
 */
function variantOf(title: string): string {
  const marks: string[] = [];
  const sim = title.match(/유사\s*(\d*)/);
  if (sim) marks.push(`유사${sim[1] || ''}`);
  const ab = title.match(/(?<![A-Za-z])([AB])\s*형/);
  if (ab) marks.push(`${ab[1]}형`);
  // 서술형만 따로 뽑은 시험지 — `(서술형)` 과 `(서술형X)` 는 다른 시험지다 (경신고 실측).
  //   X 붙은 쪽을 먼저 봐야 한다. 아니면 둘 다 '서술형'으로 뭉개진다.
  if (/서술형\s*[Xx×]/.test(title)) marks.push('서술형X');
  else if (/서술형/.test(title)) marks.push('서술형');
  // `형` 없이 제목 끝에 붙는 A/B — `심화수학1A` · `심화수학1B` (세종과학고 실측).
  //   이걸 놓치면 내용이 완전히 다른 두 시험지가 한 시험으로 묶인다 (일치율 0% 였다).
  const tail = title.match(/([AB])\s*$/);
  if (tail && !ab) marks.push(`끝${tail[1]}`);
  const subj = subjectTokenOf(title);
  if (subj) marks.push(subj);
  return marks.join('+');
}

export interface DuplicateExam {
  id: string;
  title: string;
  createdAt: string | null;
  problemCount: number;
}

/** 제목에서 "같은 시험인가"를 판정할 다섯 값을 뽑는다. 학교기출이 아니면 null. */
export function examIdentityFromTitle(title: string): ExamIdentity | null {
  const meta = parseExamTitleMeta(title);
  if (!meta) return null;
  return {
    schoolName: meta.schoolName,
    examYear: meta.examYear,
    gradeNum: meta.gradeNum,
    semester: meta.semester,
    examRound: meta.examRound,
    variant: variantOf(title),
  };
}

/** 사람이 읽는 한 줄 — 로그·안내문에 그대로 쓴다. */
export function describeIdentity(id: ExamIdentity): string {
  const tail = id.variant ? ` (${id.variant})` : '';
  return `${id.examYear}년 ${id.schoolName} ${id.gradeNum}학년 ${id.semester}학기 ${id.examRound}${tail}`;
}

/**
 * 같은 시험이 이미 있는지 본다.
 *   - 제목이 학교기출 형식이 아니면 `[]` (가드 미적용)
 *   - `institute_id` 는 **null(공통풀) 과 지정 학원을 함께** 본다.
 *     공통풀에 이미 있는 기출을 학원 소속으로 또 넣는 것도 중복이다.
 */
export async function findDuplicateExams(
  sb: SupabaseClient,
  title: string,
  instituteId: string | null
): Promise<DuplicateExam[]> {
  const identity = examIdentityFromTitle(title);
  if (!identity) return [];

  // grade 컬럼은 `중2`·`고1` 형태로 저장돼 있다 — 학교급을 모르면 둘 다 후보로 본다.
  const gradePrefix = /중(학교)?$/.test(identity.schoolName)
    ? [`중${identity.gradeNum}`]
    : /고(등학교)?$/.test(identity.schoolName)
      ? [`고${identity.gradeNum}`]
      : [`중${identity.gradeNum}`, `고${identity.gradeNum}`];

  const q = sb
    .from('exams')
    .select('id, title, created_at, institute_id')
    .is('deleted_at', null)
    .eq('school_name', identity.schoolName)
    .eq('exam_year', identity.examYear)
    .eq('semester', identity.semester)
    .eq('exam_round', identity.examRound)
    .in('grade', gradePrefix);

  // 공통풀(null) + 내 학원. `.or` 는 null 비교가 안 되므로 나눠 받는다.
  const { data: rows, error } = await q;
  if (error || !rows) return [];

  const mine = (rows as Array<{ id: string; title: string; created_at: string | null; institute_id: string | null }>)
    .filter((r) => r.institute_id === null || r.institute_id === instituteId)
    // 변형 표시가 다르면 다른 시험지다 (유사본·A형/B형을 중복으로 막지 않는다)
    .filter((r) => variantOf(r.title) === identity.variant);
  if (mine.length === 0) return [];

  // 문항 수는 "어느 쪽을 남길지" 판단 재료 — 없으면 0.
  const counts = new Map<string, number>();
  const { data: eps } = await sb
    .from('exam_problems')
    .select('exam_id')
    .in('exam_id', mine.map((r) => r.id));
  for (const ep of (eps ?? []) as Array<{ exam_id: string }>) {
    counts.set(ep.exam_id, (counts.get(ep.exam_id) ?? 0) + 1);
  }

  return mine.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    problemCount: counts.get(r.id) ?? 0,
  }));
}
