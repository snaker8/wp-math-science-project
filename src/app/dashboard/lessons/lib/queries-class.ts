// 반·등록·수업회차·lesson_plan·meeting_attendances 쿼리 (read + write)
// homeroom 앱에서 포팅 — 메인 앱 적응:
//   - diag_teacher_profiles 제거 → public.users (role ADMIN/TEACHER) 조회
//   - student_id / homeroom_id = users.id (UUID)
//   - 반 생성 시 institute_id (현재 유저의 users.institute_id) 필수
//   - RLS 가 센터 격리를 처리 (클라이언트 직접 쿼리)

import { supabaseBrowser } from '@/lib/supabase/client';
import type {
  ClassPrepBriefRow, ClassRoom, ClassMeeting, MeetingAttendance, Enrollment, LessonPlan,
} from './types-class';

function db() {
  if (!supabaseBrowser) {
    throw new Error('Supabase 클라이언트가 구성되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 확인 필요.');
  }
  return supabaseBrowser;
}

// ────────────────────────────────────────────────
// READ
// ────────────────────────────────────────────────

export async function listActiveClasses(): Promise<ClassRoom[]> {
  const { data, error } = await db()
    .from('diag_classes')
    .select('*')
    .eq('active', true)
    .order('start_time');
  if (error) throw error;
  return (data ?? []) as unknown as ClassRoom[];
}

export async function getClass(classId: string): Promise<ClassRoom | null> {
  const { data, error } = await db()
    .from('diag_classes')
    .select('*')
    .eq('id', classId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ClassRoom | null;
}

export async function getClassEnrollments(classId: string): Promise<Enrollment[]> {
  const { data, error } = await db()
    .from('diag_enrollments')
    .select('*')
    .eq('class_id', classId)
    .is('ended_at', null)
    .order('coaching_start_min');
  if (error) throw error;
  return (data ?? []) as unknown as Enrollment[];
}

export async function getClassPrepBrief(classId: string): Promise<ClassPrepBriefRow[]> {
  const { data, error } = await db()
    .from('v_class_prep_brief')
    .select('*')
    .eq('class_id', classId)
    .order('coaching_start_min');
  if (error) throw error;
  return (data ?? []) as unknown as ClassPrepBriefRow[];
}

export async function getStudentLessonPlan(
  studentId: string,
  weekStart: string,
): Promise<LessonPlan | null> {
  const { data, error } = await db()
    .from('diag_lesson_plans')
    .select('*')
    .eq('student_id', studentId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as LessonPlan | null;
}

export async function ensureMeeting(classId: string, meetDate: string): Promise<ClassMeeting> {
  const { data: existing, error: findErr } = await db()
    .from('diag_class_meetings')
    .select('*')
    .eq('class_id', classId)
    .eq('meet_date', meetDate)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as unknown as ClassMeeting;

  const { data, error } = await db()
    .from('diag_class_meetings')
    .insert({ class_id: classId, meet_date: meetDate })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ClassMeeting;
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  // CASCADE: meeting_attendances + unit_scores 함께 삭제
  const { error } = await db()
    .from('diag_class_meetings')
    .delete()
    .eq('id', meetingId);
  if (error) throw error;
}

export async function listMeetingAttendances(meetingId: string): Promise<MeetingAttendance[]> {
  const { data, error } = await db()
    .from('diag_meeting_attendances')
    .select('*')
    .eq('meeting_id', meetingId);
  if (error) throw error;
  return (data ?? []) as unknown as MeetingAttendance[];
}

// ────────────────────────────────────────────────
// WRITE — Class
// ────────────────────────────────────────────────

export async function createClass(input: {
  name: string;
  campus?: string;
  weekdays: number[];
  start_time: string;       // "20:35"
  duration_min?: number;    // default 80
  capacity?: number;        // default 7
  stage_min?: number;
  stage_max?: number;
  homeroom_id?: string | null;
}): Promise<ClassRoom> {
  const supa = db();
  const { data: { user } } = await supa.auth.getUser();

  // 담임 기본값 = 현재 로그인 유저
  let homeroomId = input.homeroom_id;
  if (!homeroomId) {
    homeroomId = user?.id ?? null;
  }

  // institute_id 필수 (NOT NULL) — 현재 유저의 센터
  let instituteId: string | null = null;
  if (user) {
    const { data: me } = await supa
      .from('users')
      .select('institute_id')
      .eq('id', user.id)
      .maybeSingle();
    instituteId = (me?.institute_id as string | null) ?? null;
  }
  if (!instituteId) {
    throw new Error('현재 사용자의 소속 센터(institute)를 확인할 수 없습니다. 로그인 상태와 사용자 배정을 확인하세요.');
  }

  const { data, error } = await supa
    .from('diag_classes')
    .insert({ ...input, homeroom_id: homeroomId, institute_id: instituteId })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ClassRoom;
}

export async function updateClass(
  id: string,
  patch: Partial<Omit<ClassRoom, 'id' | 'active'>> & { active?: boolean },
): Promise<void> {
  const { error } = await db().from('diag_classes').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deactivateClass(id: string): Promise<void> {
  const { error } = await db().from('diag_classes').update({ active: false }).eq('id', id);
  if (error) throw error;
}

export async function deleteClass(id: string): Promise<void> {
  // CASCADE: enrollments, class_meetings, meeting_attendances 모두 함께 제거.
  // lesson_plans 는 학생 단위라 별도 유지.
  // .select() 로 실제 삭제된 row 를 받아 0행이면 RLS 차단(silent fail) 감지.
  const { data, error } = await db()
    .from('diag_classes')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      '삭제가 무시되었습니다 (0 rows affected). ' +
      'RLS 정책에 막혔거나 권한이 없습니다. ' +
      '본인이 이 반의 담임이거나 admin 권한이 있는지 확인하세요.'
    );
  }
}

// ────────────────────────────────────────────────
// WRITE — Enrollment
// ────────────────────────────────────────────────

export async function createEnrollment(input: {
  student_id: string;       // users.id (UUID)
  class_id: string;
  coaching_start_min: number;
  coaching_duration_min: 5 | 10;
  stage: number;
  care_weight: number;
  note?: string | null;
}): Promise<Enrollment> {
  const { data, error } = await db()
    .from('diag_enrollments')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Enrollment;
}

export async function updateEnrollment(
  id: string,
  patch: Partial<Omit<Enrollment, 'id'>>,
): Promise<void> {
  const { error } = await db().from('diag_enrollments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function endEnrollment(id: string, endDate?: string): Promise<void> {
  const { error } = await db()
    .from('diag_enrollments')
    .update({ ended_at: endDate ?? new Date().toISOString().slice(0, 10) })
    .eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────
// WRITE — Lesson Plan (per student per week)
// ────────────────────────────────────────────────

export async function upsertLessonPlan(input: {
  student_id: string;
  week_start: string;             // "2026-04-27" (월요일)
  target_units?: string[];
  goals?: string | null;
  notes?: string | null;
  created_by?: string | null;
}): Promise<LessonPlan> {
  const { data, error } = await db()
    .from('diag_lesson_plans')
    .upsert(input, { onConflict: 'student_id,week_start' })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as LessonPlan;
}

// ────────────────────────────────────────────────
// WRITE — Meeting Attendance (per student per session)
// ────────────────────────────────────────────────

export async function upsertAttendance(input: {
  meeting_id: string;
  student_id: string;
  attendance?: 'present' | 'late' | 'absent' | 'makeup';
  target_units?: string[];
  mathflat_sheet_ids?: string[];
  mini_lecture_key?: string | null;
  homeroom_note?: string | null;
}): Promise<MeetingAttendance> {
  const { data, error } = await db()
    .from('diag_meeting_attendances')
    .upsert(input, { onConflict: 'meeting_id,student_id' })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as MeetingAttendance;
}

// ────────────────────────────────────────────────
// READ — 반 회차 이력
// ────────────────────────────────────────────────

export interface ClassMeetingHistoryRow {
  id: string;
  class_id: string;
  meet_date: string;
  meet_status: 'scheduled' | 'done' | 'cancelled';
  homeroom_note: string | null;
  diag_meeting_attendances: Array<{
    id: string;
    student_id: string;
    attendance: 'present' | 'late' | 'absent' | 'makeup';
    homeroom_note: string | null;
  }>;
}

export async function getClassMeetings(classId: string, limit = 30): Promise<ClassMeetingHistoryRow[]> {
  const { data, error } = await db()
    .from('diag_class_meetings')
    .select(`
      id, class_id, meet_date, meet_status, homeroom_note,
      diag_meeting_attendances ( id, student_id, attendance, homeroom_note )
    `)
    .eq('class_id', classId)
    .order('meet_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ClassMeetingHistoryRow[];
}

// ────────────────────────────────────────────────
// 강사 조회 (담임 선택 dropdown) — public.users 기반
// (homeroom 의 diag_teacher_profiles 대체. 해당 테이블은 메인 DB 에 없음)
// ────────────────────────────────────────────────

export interface TeacherProfile {
  user_id: string;
  display_name: string;
  role: 'homeroom' | 'admin';
}

export async function listTeachers(): Promise<TeacherProfile[]> {
  const { data, error } = await db()
    .from('users')
    .select('id, full_name, role')
    .in('role', ['ADMIN', 'TEACHER'])
    .is('deleted_at', null)
    .order('full_name');
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; full_name: string; role: string }>).map((u) => ({
    user_id: u.id,
    display_name: u.full_name,
    role: u.role === 'ADMIN' ? 'admin' : 'homeroom',
  }));
}

export async function getCurrentProfile(): Promise<TeacherProfile | null> {
  const supa = db();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  const { data } = await supa
    .from('users')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; full_name: string; role: string };
  return {
    user_id: row.id,
    display_name: row.full_name,
    role: row.role === 'ADMIN' ? 'admin' : 'homeroom',
  };
}

// ────────────────────────────────────────────────
// 학생 조회 — public.users (role=STUDENT)
// ────────────────────────────────────────────────

export interface StudentOption {
  id: string;
  full_name: string;
  grade: number | null;
}

export async function listStudents(): Promise<StudentOption[]> {
  const { data, error } = await db()
    .from('users')
    .select('id, full_name, grade')
    .eq('role', 'STUDENT')
    .is('deleted_at', null)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as unknown as StudentOption[];
}

/** student_id(UUID) 목록 → 이름 Map (enrollments 표시용) */
export async function getStudentNameMap(studentIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(studentIds)).filter(Boolean);
  if (ids.length === 0) return new Map();
  const { data, error } = await db()
    .from('users')
    .select('id, full_name')
    .in('id', ids);
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string }>).map((u) => [u.id, u.full_name]),
  );
}

// ────────────────────────────────────────────────
// READ — 전체 반 상태 (overview)
// ────────────────────────────────────────────────

export interface ClassStatsRow {
  class_id: string;
  class_name: string;
  campus: string;
  start_time: string;
  weekdays: number[];
  capacity: number;
  stage_min: number;
  stage_max: number;
  homeroom_id: string | null;
  active: boolean;
  total_meetings: number;
  recent_meetings_28d: number;
  attendance_rate_pct: number | null;
  last_meet_date: string | null;
  memo_count: number;
  enrolled_count: number;
  care_total: number;
}

export async function getAllClassStats(): Promise<ClassStatsRow[]> {
  const { data, error } = await db()
    .from('v_class_stats')
    .select('*')
    .order('active', { ascending: false })
    .order('start_time');
  if (error) throw error;
  return (data ?? []) as unknown as ClassStatsRow[];
}

// ────────────────────────────────────────────────
// 헬퍼: 빈 1:1 슬롯 (RPC)
// ────────────────────────────────────────────────

export async function suggestNextCoachingSlot(classId: string): Promise<number | null> {
  const { data, error } = await db().rpc('next_coaching_slot', { p_class_id: classId });
  if (error) throw error;
  return data as number | null;
}

// ────────────────────────────────────────────────
// 헬퍼: 주차/요일 계산
// ────────────────────────────────────────────────

export function thisWeekMonday(): string {
  return mondayOf(new Date().toISOString().slice(0, 10));
}

/** 임의 날짜(YYYY-MM-DD) 가 속한 주의 월요일을 YYYY-MM-DD 로 반환 */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun, 1=Mon
  const daysSinceMon = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - daysSinceMon);
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → 1=월 ... 7=일 */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();  // 0=Sun ... 6=Sat
  return dow === 0 ? 7 : dow;
}
