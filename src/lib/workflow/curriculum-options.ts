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
