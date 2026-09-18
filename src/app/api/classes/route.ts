// ============================================================================
// Classes API Route — 반 목록 조회 및 생성
//
// 보안 가드 (2026-05-17 P0-3): institute-guard 적용
//   - requireAuthScope() 로 인증 + scope 획득
//   - applyInstituteFilter() 로 자기 institute 만 SELECT
//   - resolveInsertInstituteId() 로 INSERT institute_id 결정
//   - 다른 학원 반 누설 차단 (RLS 의존 → 앱 레벨 격리)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, resolveInsertInstituteId } from '@/lib/security/institute-guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

// GET: 반 목록 조회
export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    let baseQuery = supabaseAdmin
      .from('classes')
      .select(`
        id,
        name,
        description,
        subject,
        grade,
        max_students,
        is_active,
        schedule,
        created_at,
        institute_id,
        tutor:users!tutor_id(id, full_name, email)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // ★ 격리 필터 — 자기 institute (또는 ORG_ADMIN: 학원 산하)
    baseQuery = applyInstituteFilter(baseQuery, scope);

    // ★ 활성 학원 핀 — "학원마다 들어가면" 그 학원 반만. super_admin/ORG_ADMIN 이 여러 학원을
    //   가질 때 전체가 섞이지 않게(학생목록 API 와 동일 규칙). 미선택(null)이면 기존 동작.
    const activeInstituteId = resolveActiveInstitute(scope);
    if (activeInstituteId) {
      baseQuery = baseQuery.eq('institute_id', activeInstituteId);
    }

    // ★ 권한별 가시성:
    //   - 관리자(super_admin / ADMIN / ORG_ADMIN): 학원 내 모든 반(다른 선생님이 만든 반 포함).
    //   - 일반 강사(TEACHER / TUTOR): 자기가 만든 반만.
    const isManager =
      scope.isSuperAdmin || user.role === 'ADMIN' || user.role === 'ORG_ADMIN';
    if (!isManager && (user.role === 'TEACHER' || user.role === 'TUTOR')) {
      baseQuery = baseQuery.eq('tutor_id', user.id);
    }

    const { data: classesRaw, error } = await baseQuery;

    if (error) {
      console.error('[classes/GET] query error:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const classRows = (classesRaw ?? []) as Array<{ id: string }>;

    // ★ 반별 등원/대기 인원 카운트 (서버 집계 — 다른 선생님 반도 RLS 우회해 정확히 셈).
    //   class_enrollments 를 한 번에 in() 조회 후 JS 집계. 1000행 한계 대비 range 페이지네이션.
    const enrolledCountById = new Map<string, number>();
    const pendingCountById = new Map<string, number>();
    const classIds = classRows.map((c) => c.id);
    if (classIds.length > 0) {
      for (let from = 0; ; from += 1000) {
        const { data: enr } = await supabaseAdmin
          .from('class_enrollments')
          .select('class_id, status')
          .in('class_id', classIds)
          .range(from, from + 999);
        const rows = (enr ?? []) as Array<{ class_id: string; status: string }>;
        for (const r of rows) {
          if (r.status === 'ACCEPTED') enrolledCountById.set(r.class_id, (enrolledCountById.get(r.class_id) || 0) + 1);
          else if (r.status === 'PENDING') pendingCountById.set(r.class_id, (pendingCountById.get(r.class_id) || 0) + 1);
        }
        if (rows.length < 1000) break;
      }
    }

    // ★ 반별 난이도 분포 — 매쓰홀릭 수업 목록의 「난이도 미니 히트맵」(10 문서 실측 정의:
    //   막대 = 수업 문항의 난이도 분포). 목록에서 반의 난이도 구성이 바로 보인다.
    //   재료 = 이 반이 실제로 다룬 시험지 문항. 두 출처를 합친다:
    //     ① 과제로 낸 시험지 (assignments.exam_id)
    //     ② 반 학생이 채점받은 시험지 (diagnostics.print_sessions.exam_id)
    //   ★ 실측(2026-09-19): 과제 0건 · 채점 세션 181건/시험지 33장/3개 반. 과제만 보면 전부 빈칸이다.
    //     채점 기록이 지금 이 반들의 실체다 — 그걸 안 보면 히트맵이 거짓말을 한다.
    //   1~10 을 6단(개념 1-3 · 기본 4-5 · 실력하 6 · 실력중 7 · 심화하 8 · 심화중 9-10)으로 센다.
    //   ★ 1,000행 한계 — 모든 단계 range 페이지네이션.
    const bandsById = new Map<string, number[]>();   // [A,B,C1,C2,D1,D2]
    if (classIds.length > 0) {
      const sb = supabaseAdmin;
      /** exam_id → 그 시험지를 다룬 반들 */
      const examToClasses = new Map<string, Set<string>>();
      const link = (examId: string, classId: string) => {
        const s = examToClasses.get(examId) ?? new Set<string>();
        s.add(classId);
        examToClasses.set(examId, s);
      };

      // ① 과제 시험지
      for (let from = 0; ; from += 1000) {
        const { data } = await sb
          .from('assignments').select('class_id, exam_id')
          .in('class_id', classIds).is('deleted_at', null).not('exam_id', 'is', null)
          .range(from, from + 999);
        const rows = (data ?? []) as Array<{ class_id: string; exam_id: string }>;
        for (const r of rows) link(r.exam_id, r.class_id);
        if (rows.length < 1000) break;
      }

      // ② 반 학생이 채점받은 시험지 — 학생 → 반 (승격 전 roster id 도 같은 학생으로 본다)
      const studentToClasses = new Map<string, Set<string>>();
      for (let from = 0; ; from += 1000) {
        const { data } = await sb
          .from('class_enrollments').select('class_id, student_id')
          .in('class_id', classIds).eq('status', 'ACCEPTED').range(from, from + 999);
        const rows = (data ?? []) as Array<{ class_id: string; student_id: string }>;
        for (const r of rows) {
          const s = studentToClasses.get(r.student_id) ?? new Set<string>();
          s.add(r.class_id);
          studentToClasses.set(r.student_id, s);
        }
        if (rows.length < 1000) break;
      }
      const userIds = Array.from(studentToClasses.keys());
      if (userIds.length > 0) {
        const { data: rs } = await sb
          .from('roster_students').select('id, promoted_user_id').in('promoted_user_id', userIds);
        for (const r of (rs ?? []) as Array<{ id: string; promoted_user_id: string }>) {
          const owner = studentToClasses.get(r.promoted_user_id);
          if (owner) studentToClasses.set(r.id, owner);
        }
      }
      const refs = Array.from(studentToClasses.keys());
      for (let i = 0; i < refs.length; i += 300) {
        const chunk = refs.slice(i, i + 300);
        for (let from = 0; ; from += 1000) {
          const { data } = await sb
            .schema('diagnostics' as never).from('print_sessions')
            .select('student_id, exam_id')
            .in('student_id', chunk).not('completed_at', 'is', null).not('exam_id', 'is', null)
            .range(from, from + 999);
          const rows = (data ?? []) as Array<{ student_id: string; exam_id: string }>;
          for (const r of rows) {
            for (const cid of studentToClasses.get(r.student_id) ?? []) link(r.exam_id, cid);
          }
          if (rows.length < 1000) break;
        }
      }

      // 시험지 → 문항 → 난이도. 한 반 안에서 같은 문제는 한 번만 센다.
      const examIds = Array.from(examToClasses.keys());
      const seen = new Set<string>();                 // `${classId}|${problemId}`
      const problemToClasses = new Map<string, Set<string>>();
      for (let i = 0; i < examIds.length; i += 300) {
        const chunk = examIds.slice(i, i + 300);
        for (let from = 0; ; from += 1000) {
          const { data } = await sb
            .from('exam_problems').select('exam_id, problem_id').in('exam_id', chunk).range(from, from + 999);
          const rows = (data ?? []) as Array<{ exam_id: string; problem_id: string }>;
          for (const r of rows) {
            for (const cid of examToClasses.get(r.exam_id) ?? []) {
              const key = `${cid}|${r.problem_id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const s = problemToClasses.get(r.problem_id) ?? new Set<string>();
              s.add(cid);
              problemToClasses.set(r.problem_id, s);
            }
          }
          if (rows.length < 1000) break;
        }
      }
      const problemIds = Array.from(problemToClasses.keys());
      const bandIndex = (d: number) => (d <= 3 ? 0 : d <= 5 ? 1 : d === 6 ? 2 : d === 7 ? 3 : d === 8 ? 4 : 5);
      for (let i = 0; i < problemIds.length; i += 300) {
        const chunk = problemIds.slice(i, i + 300);
        for (let from = 0; ; from += 1000) {
          const { data } = await sb
            .from('classifications').select('problem_id, difficulty').in('problem_id', chunk).range(from, from + 999);
          const rows = (data ?? []) as Array<{ problem_id: string; difficulty: string | number | null }>;
          for (const r of rows) {
            const d = parseInt(String(r.difficulty ?? ''), 10);
            if (!Number.isFinite(d) || d < 1 || d > 10) continue;
            for (const cid of problemToClasses.get(r.problem_id) ?? []) {
              const arr = bandsById.get(cid) ?? [0, 0, 0, 0, 0, 0];
              arr[bandIndex(d)] += 1;
              bandsById.set(cid, arr);
            }
          }
          if (rows.length < 1000) break;
        }
      }
    }

    const classes = classRows.map((c) => ({
      ...c,
      enrolledCount: enrolledCountById.get(c.id) || 0,
      pendingCount: pendingCountById.get(c.id) || 0,
      /** 난이도 6단 분포 [개념, 기본, 실력하, 실력중, 심화하, 심화중] — 과제로 낸 문항 기준 */
      difficultyBands: bandsById.get(c.id) ?? [0, 0, 0, 0, 0, 0],
    }));

    return NextResponse.json({ classes });
  } catch (error) {
    console.error('Classes GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 새 반 생성
export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    // 권한: ADMIN, ORG_ADMIN, TEACHER, TUTOR, super_admin
    if (
      !scope.isSuperAdmin &&
      user.role !== 'ADMIN' &&
      user.role !== 'ORG_ADMIN' &&
      user.role !== 'TEACHER' &&
      user.role !== 'TUTOR'
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, subject, grade, maxStudents, schedule } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // ★ INSERT institute_id — scope 기반 결정 (자기 institute 또는 super_admin override)
    let instituteId: string | null;
    try {
      instituteId = resolveInsertInstituteId(scope, null);
    } catch (e) {
      return NextResponse.json({ error: 'Institute not assigned' }, { status: 400 });
    }
    if (!instituteId) {
      return NextResponse.json({ error: 'Institute not found' }, { status: 400 });
    }

    const { data: newClass, error: insertError } = await supabaseAdmin
      .from('classes')
      .insert({
        institute_id: instituteId,
        tutor_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        subject: subject || null,
        grade: grade ? parseInt(grade) : null,
        max_students: maxStudents ? parseInt(maxStudents) : 30,
        schedule: schedule || {},
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Class name already exists' }, { status: 409 });
      }
      console.error('[classes/POST] insert error:', insertError.message);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (error) {
    console.error('Classes POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
