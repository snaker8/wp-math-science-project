// ============================================================================
// 리포트 성격(kind) — 시험지 성격별 맞춤 리포트의 단일 소스.
//   exams.is_diagnostic + exams.exam_type 로 5종 판별 → 학부모용 라벨 / 신호등 의미.
//   개별 리포트(StudentExamReportDark)·세트 리포트(ComprehensiveReportView) 공유.
//
//   Phase 1: 레버1(학부모 라벨) + 레버2(신호등 의미)만 사용.
//   Phase 1.6 예정: 레버3(narrative 톤·시제) + 레버4(섹션 강조).
// ============================================================================

import type { Achievement } from '@/lib/diagnostics/report-narrative';

export type ReportKind = 'diagnostic' | 'school' | 'mock' | 'textbook' | 'worksheet';

/** exam(is_diagnostic, exam_type) → 리포트 성격. 비진단 기본은 학교기출(내신). */
export function resolveReportKind(input: { isDiagnostic?: boolean | null; examType?: string | null }): ReportKind {
  if (input.isDiagnostic) return 'diagnostic';
  const t = (input.examType ?? '').trim();
  if (!t) return 'school';
  if (t === '학습지') return 'worksheet';
  if (t === '시중교재') return 'textbook';
  if (t === '모의고사' || /모의|수능|평가원|학평|교육청/.test(t)) return 'mock';
  return 'school'; // 학교기출 · 성취도 평가 등 실제 시험
}

// ── 레버1 — 학부모용 성격 라벨 ("이 리포트가 무슨 분석인지") ────────────────
export const REPORT_KIND_LABEL: Record<ReportKind, { emoji: string; name: string; analysis: string }> = {
  diagnostic: { emoji: '🩺', name: '진단평가',  analysis: '시험 대비 준비도 분석' },
  school:     { emoji: '🏫', name: '내신 기출',  analysis: '시험 성취도 분석' },
  mock:       { emoji: '📝', name: '모의고사',  analysis: '실전 성취 분석' },
  textbook:   { emoji: '📖', name: '시중교재',  analysis: '학습 점검' },
  worksheet:  { emoji: '📒', name: '학습지',    analysis: '학습 점검' },
};

// ── 레버2 — 신호등(Achievement level)의 의미 라벨, kind 별 ──────────────────
//   level(strong/caution/weak) 판정 로직은 동일, 표시 문구만 성격에 맞게.
const READINESS_LABEL: Record<ReportKind, Record<Achievement, string>> = {
  diagnostic: { strong: '시험 준비 안정', caution: '부분 보강 필요', weak: '집중 보강 필요' },
  school:     { strong: '성취 우수',      caution: '성취 보통',      weak: '성취 미흡' },
  mock:       { strong: '성취 우수',      caution: '성취 보통',      weak: '성취 미흡' },
  textbook:   { strong: '학습 우수',      caution: '보강 권장',      weak: '보완 필요' },
  worksheet:  { strong: '학습 우수',      caution: '보강 권장',      weak: '보완 필요' },
};

export function readinessLabelFor(kind: ReportKind, level: Achievement): string {
  return READINESS_LABEL[kind][level];
}
