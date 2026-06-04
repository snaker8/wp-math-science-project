// src/app/dashboard/prescription/lib/types.ts
// Supabase diagnostics 스키마 + public.mathsecr_types 매핑 타입

// BS/DD/PT/SC = 진단 회차. WS/EX = 일반 출제(학습지/시험지) 수동 채점 — 채점 공통 라인.
export type SessionType = 'BS' | 'DD' | 'PT' | 'SC' | 'WS' | 'EX';
export type NodeStatus = 'alpha' | 'beta' | 'gamma' | 'unknown';
export type ErrorCause = '개념' | '유형' | '계산' | '문장제' | '시간';

// 수학비서 단원 노드 (public.mathsecr_types 1행)
export interface MathsecrNode {
  code: string;                  // 예: MS07-01-03-02-05 또는 MS07-01-03-02
  subject_code: string;          // 예: 01 (과목=학년+학기)
  subject_name: string;          // 예: "중1-1"
  level1_code: string | null;    // 대단원 코드
  level1_name: string | null;    // 대단원 이름
  level2_code: string | null;    // 중단원 코드
  level2_name: string | null;    // 중단원 이름
  level3_code: string | null;    // 소단원 코드
  level3_name: string | null;    // 소단원 이름
  level4_code: string | null;    // 세부유형 코드
  level4_name: string | null;    // 세부유형 이름
  depth: number;                 // 1=과목 … 5=세부유형
  is_leaf: boolean;
  parent_code: string | null;
  full_path: string;             // "중1-1 > 소인수분해 > 소수와 합성수 > …"
}

export interface DiagnosisSession {
  id: string;
  student_id: string;
  session_type: SessionType;
  round_no: number | null;
  target_grade: number | null;
  mathflat_sheet_id: string | null;
  mathflat_sheet_name: string | null;
  conducted_at: string | null;
  conducted_by: string | null;
  duration_min: number | null;
  note: string | null;
  created_at: string;
}

export interface DiagnosisItem {
  id: string;
  session_id: string;
  mathsecr_code: string;
  seq: number;
  difficulty: number | null;
  mathflat_item_id: string | null;
  is_correct: boolean;
  error_cause: ErrorCause | null;
  time_taken_sec: number | null;
  note: string | null;
}

export interface StudentNodeStatus {
  student_id: string;
  mathsecr_code: string;
  status: NodeStatus;
  last_tested_at: string | null;
  last_score: number | null;
  items_total: number;
  items_correct: number;
  dominant_error_cause: ErrorCause | null;
  updated_at: string;
}

// 히트맵 집계 행: 학생 × 과목(학년·학기) × 대단원
export interface MathsecrHeatmapRow {
  student_id: string;
  subject_code: string;
  subject_name: string;
  level1_code: string | null;
  level1_name: string | null;
  nodes_total: number;
  alpha_count: number;
  beta_count: number;
  gamma_count: number;
  unknown_count: number;
  avg_score: number | null;
}

export const STATUS_COLOR: Record<NodeStatus, string> = {
  alpha:   '#10b981',  // emerald-500
  beta:    '#f59e0b',  // amber-500
  gamma:   '#ef4444',  // red-500
  unknown: '#3f3f46',  // zinc-700
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  alpha:   'α 마스터',
  beta:    'β 안정',
  gamma:   'γ 불안정',
  unknown: '미측정',
};
