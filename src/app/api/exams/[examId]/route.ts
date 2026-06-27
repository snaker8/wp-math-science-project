// ============================================================================
// GET /api/exams/[examId] - 시험지 정보 + 연결된 문제 조회
// PATCH /api/exams/[examId] - 시험지 수정 (제목, 북그룹 이동)
// DELETE /api/exams/[examId] - 시험지 완전 삭제 (hard delete)
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

// Next.js 14 Data Cache 비활성화
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  // ★ 로그인 + 격리 scope 필수
  const auth = await requireAuthScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth.data;

  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // 1. 시험지 정보 조회 — institute_id 포함해서 격리 가드
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .select('id, title, description, status, total_points, book_group_id, subject, exam_type, grade, created_at, institute_id')
      .eq('id', examId)
      .single();

    if (examError) {
      console.error('[API/exams] Exam fetch error:', examError.message);
      return NextResponse.json(
        { error: 'Exam not found', detail: examError.message },
        { status: 404 }
      );
    }

    // 격리 가드 — 다른 institute exam 접근 차단
    // ★ NULL (공통 풀) 은 모든 로그인 사용자 접근 허용 (2026-05-26 사고 fix):
    //   사용자 정책 = "원래 자산화한 문제는 모두 다 보이게, 엄궁차수학만 격리".
    //   NULL exam = 공통 풀 — assertInstituteAccess throw 대신 통과.
    //   PATCH/DELETE 는 의도적으로 기존 동작 유지 (NULL 시험지 수정·삭제는 super_admin 만).
    const examInstituteId = (exam as { institute_id: string | null }).institute_id;
    if (examInstituteId !== null) {
      try {
        assertInstituteAccess(scope, examInstituteId);
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 2. exam_problems 조회 (supabaseAdmin + JOIN은 0건 반환 이슈 → 분리 쿼리)
    const { data: examProblems, error: epError } = await supabaseAdmin
      .from('exam_problems')
      .select('sequence_number, points, problem_id')
      .eq('exam_id', examId)
      .order('sequence_number', { ascending: true });

    if (epError) {
      console.error('[API/exams] exam_problems fetch error:', epError.message);
    }

    const rows = examProblems || [];

    // 3. problem_id 목록으로 problems 별도 조회
    const problemIds = rows.map((r: any) => r.problem_id).filter(Boolean);
    let problemsMap = new Map<string, any>();

    if (problemIds.length > 0) {
      const { data: problemsData, error: pErr } = await supabaseAdmin
        .from('problems')
        .select('id, content_latex, solution_latex, answer_json, images, source_name, source_year, status, ai_analysis, tags, created_at')
        .in('id', problemIds);

      if (pErr) {
        console.error('[API/exams] problems fetch error:', pErr.message);
      }

      // 4. classifications 별도 조회 (expanded_type_code 포함)
      const { data: classData, error: cErr } = await supabaseAdmin
        .from('classifications')
        .select('problem_id, type_code, expanded_type_code, difficulty, cognitive_domain, ai_confidence')
        .in('problem_id', problemIds);

      if (cErr) {
        console.error('[API/exams] classifications fetch error:', cErr.message);
      }

      const classMap = new Map<string, any>();
      (classData || []).forEach((c: any) => classMap.set(c.problem_id, c));

      // 5. expanded_math_types + mathsecr_types 에서 유형명 일괄 조회
      //    - MA-* 레거시 코드: expanded_math_types
      //    - MS* 코드 (수학비서): mathsecr_types.full_path
      //    이전엔 MS 코드에 대한 lookup 이 없어 type_code 보정 후 type_name
      //    이 빈값으로 떨어지던 사고. 보정한 코드가 화면에 라벨 없이 보이거나
      //    이전 typeName 잔존으로 \"수정이 반영 안 됐다\" 인상을 주던 원인.
      const allTypeCodes = new Set<string>();
      (classData || []).forEach((c: any) => {
        if (c.type_code) allTypeCodes.add(c.type_code);
        if (c.expanded_type_code) allTypeCodes.add(c.expanded_type_code);
      });

      const typeNamesMap = new Map<string, string>();
      if (allTypeCodes.size > 0) {
        // (a) MA-* 코드 — expanded_math_types
        const LEVEL_PREFIXES = ['MA-HS0', 'MA-HS1', 'MA-HS2', 'MA-MS1', 'MA-MS2', 'MA-MS3', 'MA-EL4', 'MA-EL5', 'MA-EL6'];
        const maLookup = new Set<string>();
        const msLookup = new Set<string>();
        allTypeCodes.forEach(code => {
          if (code.startsWith('MS')) {
            msLookup.add(code);
          } else if (code.startsWith('MA-')) {
            maLookup.add(code);
          } else {
            // 짧은 레거시 코드 (EQU-06-001 등) — 모든 level prefix 조합
            maLookup.add(code);
            LEVEL_PREFIXES.forEach(prefix => maLookup.add(`${prefix}-${code}`));
          }
        });

        if (maLookup.size > 0) {
          const { data: typeData } = await supabaseAdmin
            .from('expanded_math_types')
            .select('type_code, type_name')
            .in('type_code', Array.from(maLookup));
          (typeData || []).forEach((t: any) => {
            typeNamesMap.set(t.type_code, t.type_name);
            if (t.type_code.startsWith('MA-')) {
              const parts = t.type_code.split('-');
              if (parts.length >= 5) {
                const shortCode = parts.slice(2).join('-');
                typeNamesMap.set(shortCode, t.type_name);
              }
            }
          });
        }

        // (b) MS* 코드 — mathsecr_types.full_path 를 type_name 으로 사용
        if (msLookup.size > 0) {
          const { data: msData } = await supabaseAdmin
            .from('mathsecr_types')
            .select('code, full_path')
            .in('code', Array.from(msLookup));
          (msData || []).forEach((t: any) => {
            if (t.code && t.full_path) {
              typeNamesMap.set(t.code, t.full_path);
            }
          });
        }
      }

      // 6. classifications에 type_name 병합 — ★ type_code 우선 (사용자 수동 보정 반영용)
      //    이전엔 expanded_type_code 우선이라 PATCH 가 type_code 만 갱신해도 옛 typeName 잔존.
      //    PATCH 가 두 컬럼을 동기화하지만, 레거시 데이터 또는 race 대비해 lookup 우선순위도
      //    type_code → expanded_type_code 로 변경.
      (classData || []).forEach((c: any) => {
        const typeName = typeNamesMap.get(c.type_code || '') || typeNamesMap.get(c.expanded_type_code || '');
        if (typeName) c.type_name = typeName;
      });

      (problemsData || []).forEach((p: any) => {
        problemsMap.set(p.id, {
          ...p,
          classifications: classMap.get(p.id) || null,
        });
      });
    }

    // 5. exam_problems 행에 problem 데이터 병합
    const mergedProblems = rows.map((row: any) => ({
      sequence_number: row.sequence_number,
      points: row.points,
      problem_id: row.problem_id,
      problems: problemsMap.get(row.problem_id) || null,
    })).filter((r: any) => r.problems !== null);

    return NextResponse.json({
      exam,
      problems: mergedProblems,
      problemCount: mergedProblems.length,
    });
  } catch (err) {
    console.error('[API/exams] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/exams/[examId] - 시험지 수정 (ADMIN/TEACHER/TUTOR)
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  // ★ 편집자 role + 격리 scope
  const guard = await requireAuthScope();
  if (!guard.ok) return guard.response;
  const { user, scope } = guard.data;
  const isEditor = user.role === 'ADMIN' || user.role === 'TEACHER' || user.role === 'TUTOR' || user.role === 'ORG_ADMIN';
  if (!isEditor) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  // 격리 가드 — exam 의 institute 접근 권한 검증
  const { data: existingExam } = await supabaseAdmin
    .from('exams')
    .select('institute_id, created_by')
    .eq('id', examId)
    .maybeSingle();
  if (!existingExam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }
  {
    const ex = existingExam as { institute_id: string | null; created_by: string | null };
    if (ex.institute_id === null) {
      // ★ 공통풀(공유 라이브러리) 시험지 — 올린(생성) 강사 본인 또는 super_admin 만 수정 허용.
      //   업로더는 자기가 올린 자료(제목·폴더 등) 관리 가능 + 격리 학원 강사가 공유 시험지를
      //   임의로 바꾸는 것은 차단. (사용자 정책 2026-06-20: "올리는 강사는 이름 변경 가능")
      const isOwner = !!ex.created_by && ex.created_by === user.id;
      if (!scope.isSuperAdmin && !isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      // 격리 자료 — institute 접근 권한 검증
      try {
        assertInstituteAccess(scope, ex.institute_id);
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  try {
    const body = await request.json();
    const { title, bookGroupId, subject, examType, grade, isDiagnostic, syncProblemSources } = body;

    const updateData: Record<string, any> = {};

    if (title !== undefined) updateData.title = title.trim();
    if (bookGroupId !== undefined) updateData.book_group_id = bookGroupId; // null allowed (move to unclassified)
    if (subject !== undefined) updateData.subject = subject;
    if (examType !== undefined) updateData.exam_type = examType; // null 허용 (진단평가 카테고리 변경 시)
    if (isDiagnostic !== undefined) updateData.is_diagnostic = isDiagnostic;
    if (grade !== undefined) updateData.grade = grade;

    // ★ 제목 수정 시 과목·학년 자동 재감지 (룰베이스, 비용 0) — subject/grade 를 명시적으로 안 보냈을 때만.
    //   자산화 때 부정확한 제목으로 박힌 과목/학년이 제목 교정 후에도 옛 값으로 남던 문제 해소.
    //   감지 결과가 비면 기존 값 보존(덮어쓰기 X).
    if (title !== undefined && (subject === undefined || grade === undefined)) {
      try {
        const { detectSubjectFromTitle, detectGradeFromTitle } = await import('@/lib/workflow/title-detect');
        const t = title.trim();
        if (subject === undefined) { const s = detectSubjectFromTitle(t); if (s) updateData.subject = s; }
        if (grade === undefined) { const g = detectGradeFromTitle(t); if (g) updateData.grade = g; }
      } catch { /* 감지 실패 시 제목만 갱신 */ }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: exam, error } = await supabaseAdmin
      .from('exams')
      .update(updateData)
      .eq('id', examId)
      .select('id, title, book_group_id')
      .single();

    if (error) {
      console.error('[API/exams] Patch error:', error.message);
      return NextResponse.json(
        { error: 'Failed to update exam', detail: error.message },
        { status: 500 }
      );
    }

    // ★ syncProblemSources: true + title 수정 시 해당 시험지의 모든 문제
    //   source_name을 새 title과 동기화 (카드 태그까지 즉시 반영)
    let syncedProblems = 0;
    if (syncProblemSources && title !== undefined && exam.title) {
      const { data: eps } = await supabaseAdmin
        .from('exam_problems')
        .select('problem_id')
        .eq('exam_id', examId);
      const problemIds = (eps || []).map((r: { problem_id: string }) => r.problem_id);
      if (problemIds.length > 0) {
        const { error: syncErr, count } = await supabaseAdmin
          .from('problems')
          .update({ source_name: exam.title }, { count: 'exact' })
          .in('id', problemIds);
        if (syncErr) {
          console.error('[API/exams] Sync problem sources error:', syncErr.message);
        } else {
          syncedProblems = count || problemIds.length;
        }
      }
    }

    return NextResponse.json({ exam, syncedProblems });
  } catch (err) {
    console.error('[API/exams] Patch unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/exams/[examId] - 시험지 완전 삭제 (hard delete)
// ★ supabaseAdmin이 이 라우트에서 0건 반환하는 문제 → raw HTTP(PostgREST)로 전체 우회
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  // ★ 편집자 role + 격리 scope (학생이 남 시험지 지우는 것 방지 + cross-tenant 차단)
  const guard = await requireAuthScope();
  if (!guard.ok) return guard.response;
  const { user, scope } = guard.data;
  const isEditor = user.role === 'ADMIN' || user.role === 'TEACHER' || user.role === 'TUTOR' || user.role === 'ORG_ADMIN';
  if (!isEditor) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { examId } = await params;

  if (!supabaseAdmin) {
    console.error('[API/exams] DELETE: supabaseAdmin 미설정');
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // 격리 가드 — exam 의 institute_id 확인 후 권한 체크 (cross-tenant 삭제 차단)
  const { data: existingExam, error: lookupErr } = await supabaseAdmin
    .from('exams')
    .select('institute_id, title')
    .eq('id', examId)
    .maybeSingle();
  if (lookupErr) {
    console.error('[API/exams] DELETE lookup 실패:', lookupErr.message);
    return NextResponse.json({ error: `DB 조회 실패: ${lookupErr.message}` }, { status: 500 });
  }
  if (!existingExam) {
    return NextResponse.json({ error: '해당 시험지를 찾을 수 없습니다.' }, { status: 404 });
  }
  try {
    assertInstituteAccess(scope, (existingExam as { institute_id: string | null }).institute_id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ★ raw HTTP(PostgREST) 우회 제거 (2026-05-31): raw fetch SELECT 가 "DB 조회 실패"로
  //   깨지는 사고. 동일 핸들러의 supabaseAdmin 단건 조회는 정상이므로 삭제도 supabaseAdmin
  //   으로 통일. (DELETE 는 mutation 이라 Next.js Data Cache 영향 없음)
  try {
    console.log(
      `[API/exams] DELETE 요청: examId="${examId}" title="${(existingExam as { title?: string }).title ?? ''}"`,
    );
    const { error: delErr } = await supabaseAdmin
      .from('exams')
      .delete()
      .eq('id', examId);
    if (delErr) {
      console.error('[API/exams] DELETE 실패:', delErr.message);
      return NextResponse.json(
        { error: `삭제 실패: ${delErr.message}` },
        { status: 500 },
      );
    }
    console.log(`[API/exams] ✓ 삭제 완료: ${examId}`);
    return NextResponse.json({ success: true, examId });
  } catch (err) {
    console.error('[API/exams] Delete unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
