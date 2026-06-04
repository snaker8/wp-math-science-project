// ============================================================================
// 모의고사 4종 타입/라벨 — student_exam_scores.exam_type 공유 상수
//
//   자사관 플래너 연동 (/api/msb/students/{id}/exams) 과 점수 입력 UI
//   (/tutor/students 모달) 가 같은 코드·라벨을 쓴다.
//   DB CHECK 제약 (20260604_001_student_exam_scores.sql) 과 동기 유지할 것.
// ============================================================================

export const MOCK_EXAM_TYPES = ['mockFinal1', 'mockFinal2', 'mock1', 'mock2'] as const;

export type MockExamType = (typeof MOCK_EXAM_TYPES)[number];

export const MOCK_EXAM_LABELS: Record<MockExamType, string> = {
  mockFinal1: '미리보는 기말 1회',
  mockFinal2: '미리보는 기말 2회',
  mock1: '모의고사 1회',
  mock2: '모의고사 2회',
};

export function isMockExamType(v: unknown): v is MockExamType {
  return typeof v === 'string' && (MOCK_EXAM_TYPES as readonly string[]).includes(v);
}
