// ============================================================================
// 학년·학기(교육과정) 선택 옵션 — 클라이언트 안전 모듈
//
// ★ 분리 이유 (2026-07-22): 이 배열은 원래 mathsecr-prompt.ts 에 있었는데,
//   mathsecr-prompt 는 mathsecr_complete.json(3.3MB) 을 import 하므로
//   클라이언트 컴포넌트(CloudFlowUploader)가 이 배열 하나 때문에 JSON 전체를
//   번들에 끌고 들어갔다 (workflow 라우트 First Load 523kB 의 230kB gz).
//   클라이언트에서는 반드시 이 모듈을 import 할 것 — mathsecr-prompt 금지.
//   서버 코드는 mathsecr-prompt 의 re-export 를 그대로 써도 무방.
// ============================================================================

/**
 * 같은 학년의 이웃 과정 — 학교 시험은 범위가 섞인다.
 *
 * ★ 대표 지시 (2026-09-14): "1-2 학기로 보지 말고 **과정을 보고** 분류하라."
 *   분류기는 이웃 과정 유형표를 함께 본다(classify.ts · cloud-flow · reanalyze).
 *   ★ 사람이 손으로 고치는 트리 선택기도 같아야 한다 — 기계는 두 과정을 보는데
 *     사람은 한 과정만 보이면, 기계가 맞게 넣은 걸 사람이 되돌리게 된다.
 * ★ 여기(클라이언트 안전 모듈)에 둔다. mathsecr-prompt 는 3.3MB JSON 을 물고 있어
 *   클라이언트가 import 하면 안 된다 — 서버는 거기서 re-export 로 쓴다.
 */
export const NEIGHBOR_COURSES: Record<string, string[]> = {
  '01': ['02'], '02': ['01'],   // 중1-1 ↔ 중1-2 (좌표평면·정비례/반비례가 2학기 시험에 흔히 섞인다)
  '03': ['04'], '04': ['03'],   // 중2-1 ↔ 중2-2
  '05': ['06'], '06': ['05'],   // 중3-1 ↔ 중3-2
  '07': ['08'], '08': ['07'],   // 공통수학1 ↔ 공통수학2 (2015 수학(상)/(하) 범위 혼재)
  '09': ['10', '11'],           // 대수(구 수학I) → +미적분1, 확통
  '10': ['09'],                 // 미적분1(구 수학II) → +대수 (같은 학년)
};

/** 고른 과정 + 같은 학년의 이웃 과정. 고른 것이 **앞**에 온다. */
export function withNeighborCourses(code: string | string[] | null | undefined): string[] {
  const base = Array.isArray(code) ? code : (code ? [code] : []);
  const out: string[] = [...base];
  for (const c of base) {
    for (const n of NEIGHBOR_COURSES[c] || []) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * 자산화 업로드 UI 에서 학년·학기(특이 진도 대비 복수 선택)를 고르는 옵션 목록.
 * code 는 mathsecr 과목코드(01~13), label 은 표시명. 선택값은 exams.curriculum_codes 로 저장돼
 * 분류 컨텍스트에 제목 추론보다 우선 사용된다.
 */
export const CURRICULUM_OPTIONS: Array<{ code: string; label: string; group: '중등' | '고등' }> = [
  { code: '01', label: '중1-1', group: '중등' },
  { code: '02', label: '중1-2', group: '중등' },
  { code: '03', label: '중2-1', group: '중등' },
  { code: '04', label: '중2-2', group: '중등' },
  { code: '05', label: '중3-1', group: '중등' },
  { code: '06', label: '중3-2', group: '중등' },
  { code: '07', label: '공통수학1', group: '고등' },
  { code: '08', label: '공통수학2', group: '고등' },
  { code: '09', label: '대수', group: '고등' },
  { code: '10', label: '미적분1', group: '고등' },
  { code: '11', label: '확률과 통계', group: '고등' },
  { code: '12', label: '미적분2', group: '고등' },
  { code: '13', label: '기하', group: '고등' },
];
