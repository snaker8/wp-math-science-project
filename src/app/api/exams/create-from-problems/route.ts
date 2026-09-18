// ============================================================================
// POST /api/exams/create-from-problems
//
// 시험지 출제 페이지(/dashboard/exam-create)에서 선택한 문항들로 시험지 생성.
// 흐름: exams INSERT + exam_problems INSERT. (PR #32 generate-recommended-session 패턴, 자산화 안전 가드 준수)
//
// ★ 매쓰홀릭 학습지 설정 3종 (2026-09-19, docs/benchmark/matholic/04 「가져올 것」):
//   · 서술형 시작 번호  — 서답형을 N번부터 뒤로 모은다 (객관식이 앞, 서답형이 뒤)
//   · 분할생성          — N문제씩 / K등분으로 **여러 장을 한 번에** 만든다 (회차 학습 운영과 직결)
//   · 기간(제출기간)    — 출제 시점에 박는다. 반을 고르면 **과제(배포)까지 한 번에**
//                         (매쓰홀릭: 출제 = 배포. 우리는 갈라져 있었다 — 04 문서)
//
// body: {
//   title, grade?, subject?, problemIds: string[],
//   descriptiveFrom?: number | null,                       // 서답형 시작 번호 (1-based)
//   split?: { mode: 'count' | 'parts'; value: number } | null,
//   period?: { startsAt?: string | null; dueAt?: string | null } | null,
//   classId?: string | null,                               // 지정하면 반 전원에게 과제
// }
// 반환: { examId, examIds[], assignmentIds[], problemCount }
//
// ★ 만들다 실패하면 되돌린다 — 문제 없는 시험지·대상 없는 과제 같은 껍데기를 남기지 않는다
//   (CLAUDE.md 안전 가드 #1 과 같은 종류. from-problems 라우트와 같은 원칙).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface Body {
  title?: string;
  grade?: string | null;
  subject?: string | null;
  problemIds?: string[];
  descriptiveFrom?: number | null;
  split?: { mode?: 'count' | 'parts'; value?: number } | null;
  period?: { startsAt?: string | null; dueAt?: string | null } | null;
  classId?: string | null;
}

/** ISO 날짜 문자열만 통과 — 잘못된 값은 null (DB 에러로 시험지 생성이 막히면 안 된다) */
function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 균등 분할 — 나머지는 앞쪽 묶음에 하나씩 (매쓰홀릭 「균등 분할」) */
function chunkEven<T>(arr: T[], parts: number): T[][] {
  const k = Math.max(1, Math.min(parts, arr.length));
  const base = Math.floor(arr.length / k);
  const extra = arr.length % k;
  const out: T[][] = [];
  let i = 0;
  for (let g = 0; g < k; g++) {
    const size = base + (g < extra ? 1 : 0);
    out.push(arr.slice(i, i + size));
    i += size;
  }
  return out.filter((c) => c.length > 0);
}

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  const problemIds = Array.from(new Set((Array.isArray(body.problemIds) ? body.problemIds : []).filter(Boolean)));

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (problemIds.length === 0) return NextResponse.json({ error: 'problemIds required' }, { status: 400 });
  if (problemIds.length > 100) return NextResponse.json({ error: 'problemIds 최대 100개' }, { status: 400 });

  const teacherId = guard.user?.id || null;
  if (!teacherId) return NextResponse.json({ error: '강사 인증 필요' }, { status: 401 });

  // 강사 institute_id (exam INSERT 필수)
  const { data: teacherRow } = await sb
    .from('users')
    .select('institute_id')
    .eq('id', teacherId)
    .maybeSingle();
  const instituteId = (teacherRow as { institute_id?: string })?.institute_id;
  if (!instituteId) {
    return NextResponse.json({ error: '강사 institute_id가 없습니다' }, { status: 400 });
  }

  // ── 반 배포 요청이면 반부터 확인한다 (시험지를 만든 뒤 반이 없어 껍데기가 남으면 안 된다) ──
  const classId = typeof body.classId === 'string' && body.classId ? body.classId : null;
  let classStudentIds: string[] = [];
  let className = '';
  if (classId) {
    const { data: cls } = await sb
      .from('classes').select('id, name, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
    const c = cls as { id: string; name: string; institute_id: string | null } | null;
    if (!c) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
    // ★ 같은 센터의 반에만 배포한다 — 다른 센터 반에 과제가 꽂히는 사고 차단
    if (c.institute_id !== instituteId) return NextResponse.json({ error: '다른 센터의 반입니다' }, { status: 403 });
    className = c.name;
    const { data: en } = await sb
      .from('class_enrollments').select('student_id').eq('class_id', classId).eq('status', 'ACCEPTED');
    classStudentIds = Array.from(new Set(((en ?? []) as Array<{ student_id: string }>).map((e) => e.student_id)));
    if (classStudentIds.length === 0) {
      return NextResponse.json({ error: '이 반에 등록된 학생이 없습니다' }, { status: 400 });
    }
  }

  // ── 서술형 시작 번호 — 서답형을 N번부터 뒤로 모은다 ─────────────────────
  //   객관식은 넘어온 순서대로 앞에, 서답형은 넘어온 순서대로 뒤에.
  //   N 은 「자리」다: 객관식이 N-1개보다 적으면 서답형은 그만큼 앞당겨진다(빈 번호를 만들 수는 없다).
  let ordered = problemIds;
  const descriptiveFrom = Number.isFinite(Number(body.descriptiveFrom)) && Number(body.descriptiveFrom) >= 1
    ? Math.floor(Number(body.descriptiveFrom)) : null;
  if (descriptiveFrom) {
    const { data: rows } = await sb.from('problems').select('id, answer_type').in('id', problemIds);
    const typeOf = new Map(((rows ?? []) as Array<{ id: string; answer_type: string | null }>).map((r) => [r.id, r.answer_type]));
    const objective = problemIds.filter((id) => typeOf.get(id) !== 'short_answer');
    const descriptive = problemIds.filter((id) => typeOf.get(id) === 'short_answer');
    // N-1 번까지는 객관식, 그 뒤가 서답형. 객관식이 남으면 서답형 뒤에 이어 붙인다.
    const head = objective.slice(0, descriptiveFrom - 1);
    const tail = objective.slice(descriptiveFrom - 1);
    ordered = [...head, ...descriptive, ...tail];
  }

  // ── 분할생성 — N문제씩 / K등분 ───────────────────────────────────────────
  let groups: string[][] = [ordered];
  const split = body.split && typeof body.split === 'object' ? body.split : null;
  if (split && Number(split.value) >= 1) {
    const v = Math.floor(Number(split.value));
    if (split.mode === 'parts') groups = chunkEven(ordered, v);
    else {
      groups = [];
      for (let i = 0; i < ordered.length; i += v) groups.push(ordered.slice(i, i + v));
    }
  }
  if (groups.length > 20) return NextResponse.json({ error: '한 번에 20장까지만 만듭니다' }, { status: 400 });

  const period = body.period && typeof body.period === 'object' ? body.period : null;
  const startsAt = isoOrNull(period?.startsAt);
  const dueAt = isoOrNull(period?.dueAt);
  const splitGroup = groups.length > 1 ? randomUUID() : null;

  // ── 만들기 — 실패하면 만든 것을 전부 되돌린다 ──────────────────────────
  const createdExamIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const rollback = async () => {
    if (createdAssignmentIds.length) {
      await sb.from('assignment_students').delete().in('assignment_id', createdAssignmentIds);
      await sb.from('assignments').delete().in('id', createdAssignmentIds);
    }
    if (createdExamIds.length) {
      await sb.from('exam_problems').delete().in('exam_id', createdExamIds);
      await sb.from('exams').delete().in('id', createdExamIds);
    }
  };

  for (let gi = 0; gi < groups.length; gi++) {
    const ids = groups[gi];
    const examTitle = groups.length > 1 ? `${title} (${gi + 1}/${groups.length})` : title;

    // ★ 자산화 안전 가드: exam INSERT 실패 시 즉시 abort.
    const { data: examData, error: examErr } = await sb
      .from('exams')
      .insert({
        institute_id: instituteId,
        created_by: teacherId,
        title: examTitle,
        grade: body.grade || null,
        subject: body.subject || null,
        status: 'DRAFT',
        scheduled_start: startsAt,
        scheduled_end: dueAt,
        settings: {
          ...(splitGroup ? { split: { group: splitGroup, index: gi + 1, of: groups.length, mode: split?.mode ?? 'count', value: split?.value ?? null } } : {}),
          ...(descriptiveFrom ? { descriptiveFrom } : {}),
        },
      })
      .select('id')
      .single();
    if (examErr || !examData) {
      console.error('[exams/create-from-problems] exam INSERT 실패:', examErr?.message);
      await rollback();
      return NextResponse.json({ error: '시험지 생성 실패', detail: examErr?.message }, { status: 500 });
    }
    const examId = (examData as { id: string }).id;
    createdExamIds.push(examId);

    const { error: epErr } = await sb.from('exam_problems').insert(
      ids.map((pid, i) => ({ exam_id: examId, problem_id: pid, sequence_number: i + 1 })),
    );
    if (epErr) {
      console.error('[exams/create-from-problems] exam_problems insert 실패:', epErr.message);
      await rollback();
      return NextResponse.json({ error: '문항 연결 실패', detail: epErr.message }, { status: 500 });
    }

    // 반 배포 — 시험지마다 과제 하나, 대상은 반 전원
    if (classId) {
      const { data: asg, error: aErr } = await sb
        .from('assignments')
        .insert({
          class_id: classId,
          institute_id: instituteId,
          title: examTitle,
          kind: 'unit',
          exam_id: examId,
          starts_at: startsAt,
          due_at: dueAt,
          note: `출제 화면에서 배포 · ${className}`,
          created_by: teacherId,
        })
        .select('id')
        .single();
      if (aErr || !asg) {
        await rollback();
        return NextResponse.json({ error: '과제 생성 실패', detail: aErr?.message }, { status: 500 });
      }
      const assignmentId = (asg as { id: string }).id;
      createdAssignmentIds.push(assignmentId);
      const { error: linkErr } = await sb.from('assignment_students').insert(
        classStudentIds.map((sid) => ({ assignment_id: assignmentId, student_id: sid })),
      );
      if (linkErr) {
        await rollback();
        return NextResponse.json({ error: '대상 학생 등록 실패', detail: linkErr.message }, { status: 500 });
      }
    }
  }

  console.log(
    `[exams/create-from-problems] ★ 시험지 생성: ${createdExamIds.length}장, problems=${ordered.length}` +
    `${descriptiveFrom ? `, 서답형 ${descriptiveFrom}번부터` : ''}${classId ? `, 반 배포 ${className}(${classStudentIds.length}명)` : ''}` +
    `, by=${teacherId.slice(0, 8)}`,
  );

  return NextResponse.json({
    examId: createdExamIds[0],
    examIds: createdExamIds,
    assignmentIds: createdAssignmentIds,
    problemCount: ordered.length,
  });
}
