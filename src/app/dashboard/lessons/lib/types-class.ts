// 반·등록·수업회차 타입 — 자체 도메인 (mathsecr 의존 없음)

import type { ErrorCause } from './types';

export interface ClassRoom {
  id: string;
  name: string;
  campus: string;
  weekdays: number[];
  start_time: string;       // "16:00:00"
  duration_min: number;
  capacity: number;
  stage_min: number;        // 1~5
  stage_max: number;
  homeroom_id: string | null;   // users.id (UUID)
  institute_id?: string | null; // 센터 격리 (NOT NULL — INSERT 시 필수)
  active: boolean;
}

export interface Enrollment {
  id: string;
  student_id: string;       // users.id (UUID)
  class_id: string;
  // 1:1 코칭이 시작되는 분 (0 ≤ x < 90, 5분 단위)
  coaching_start_min: number;
  // 1:1 코칭 길이 (5 또는 10분)
  coaching_duration_min: 5 | 10;
  stage: 1 | 2 | 3 | 4 | 5;
  care_weight: number;      // 0.5 ~ 2.0
  enrolled_at: string;
  ended_at: string | null;
  note: string | null;
}

export interface ClassMeeting {
  id: string;
  class_id: string;
  meet_date: string;
  meet_status: 'scheduled' | 'done' | 'cancelled';
  homeroom_note: string | null;
}

export interface MeetingAttendance {
  id: string;
  meeting_id: string;
  student_id: string;
  attendance: 'present' | 'late' | 'absent' | 'makeup';
  target_units: string[];      // 단원명 자유 텍스트
  mathflat_sheet_ids: string[];
  mini_lecture_key: string | null;
  homeroom_note: string | null;
}

export interface LessonPlan {
  id: string;
  student_id: string;
  week_start: string;
  target_units: string[];
  goals: string | null;
  notes: string | null;
  updated_at?: string | null;
}

// v_class_prep_brief 뷰의 row 타입
export interface ClassPrepBriefRow {
  class_id: string;
  class_name: string;
  campus: string;
  start_time: string;
  duration_min: number;
  capacity: number;
  homeroom_id: string | null;
  student_id: string;
  student_name: string | null;
  coaching_start_min: number;
  coaching_duration_min: number;
  stage: number;
  care_weight: number;
  latest_plan: {
    student_id: string;
    week_start: string;
    target_units: string[];
    goals: string | null;
    notes: string | null;
  } | null;
  // 진단 데이터(nullable) — 향후 진단 모듈 추가 시 채움
  recent_units: Array<{
    unit_name: string;
    status: 'alpha' | 'beta' | 'gamma' | 'unknown';
    last_score: number | null;
    dominant_error_cause: ErrorCause | null;
  }> | null;
  error_profile: Partial<Record<ErrorCause, number>> | null;
}

export const STAGE_LABEL: Record<number, string> = {
  1: 'S1 진단·복구',
  2: 'S2 따라잡기',
  3: 'S3 안정·선행',
  4: 'S4 본격 선행',
  5: 'S5 심화·내신',
};

export const STAGE_COLOR: Record<number, string> = {
  1: '#B44641',
  2: '#C8A265',
  3: '#7A9B6E',
  4: '#4A7C59',
  5: '#2B2620',
};

export const WEEKDAY_LABEL_KO = ['', '월', '화', '수', '목', '금', '토', '일'];
