// ============================================================================
// GET /api/exams/[examId] - 시험지 정보 + 연결된 문제 조회
// PATCH /api/exams/[examId] - 시험지 수정 (제목, 북그룹 이동)
// DELETE /api/exams/[examId] - 시험지 완전 삭제 (hard delete)
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Next.js 14 Data Cache 비활성화
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // 1. 시험지 정보 조회 (schema.sql 기준 컬럼)
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .select('id, title, description, status, total_points, book_group_id, created_at')
      .eq('id', examId)
      .single();

    if (examError) {
      console.error('[API/exams] Exam fetch error:', examError.message);
      return NextResponse.json(
        { error: 'Exam not found', detail: examError.message },
        { status: 404 }
      );
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

      // 5. expanded_math_types에서 유형명 일괄 조회
      // ★ classifications에는 "EQU-06-001" (짧은 형식), expanded_math_types에는 "MA-HS0-EQU-06-001" (전체 형식)
      //    → 짧은 코드에 가능한 prefix를 붙여서 정확 매칭
      const allTypeCodes = new Set<string>();
      (classData || []).forEach((c: any) => {
        if (c.type_code) allTypeCodes.add(c.type_code);
        if (c.expanded_type_code) allTypeCodes.add(c.expanded_type_code);
      });

      const typeNamesMap = new Map<string, string>();
      if (allTypeCodes.size > 0) {
        // 짧은 코드(EQU-06-001)에 가능한 level prefix를 붙여 전체 코드 후보 생성
        const LEVEL_PREFIXES = ['MA-HS0', 'MA-HS1', 'MA-HS2', 'MA-MS1', 'MA-MS2', 'MA-MS3', 'MA-EL4', 'MA-EL5', 'MA-EL6'];
        const lookupCodes = new Set<string>();
        allTypeCodes.forEach(code => {
          lookupCodes.add(code); // 원본 코드
          if (!code.startsWith('MA-')) {
            // 짧은 코드 → 모든 prefix 조합 추가
            LEVEL_PREFIXES.forEach(prefix => lookupCodes.add(`${prefix}-${code}`));
          }
        });

        const { data: typeData } = await supabaseAdmin
          .from('expanded_math_types')
          .select('type_code, type_name')
          .in('type_code', Array.from(lookupCodes));

        (typeData || []).forEach((t: any) => {
          typeNamesMap.set(t.type_code, t.type_name);
          // 전체 코드에서 짧은 코드도 매핑 (MA-HS0-EQU-06-001 → EQU-06-001)
          if (t.type_code.startsWith('MA-')) {
            const parts = t.type_code.split('-');
            if (parts.length >= 5) {
              const shortCode = parts.slice(2).join('-');
              typeNamesMap.set(shortCode, t.type_name);
            }
          }
        });
      }

      // 6. classifications에 type_name 병합
      (classData || []).forEach((c: any) => {
        const typeName = typeNamesMap.get(c.expanded_type_code || '') || typeNamesMap.get(c.type_code || '');
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
// PATCH /api/exams/[examId] - 시험지 수정 (제목 변경, 북그룹 이동)
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { title, bookGroupId } = body;

    const updateData: Record<string, any> = {};

    if (title !== undefined) updateData.title = title.trim();
    if (bookGroupId !== undefined) updateData.book_group_id = bookGroupId; // null allowed (move to unclassified)

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

    return NextResponse.json({ exam });
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
  const { examId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[API/exams] DELETE: env 미설정', { supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey });
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    console.log(`[API/exams] DELETE 요청: examId="${examId}" (len=${examId.length})`);
    console.log(`[API/exams] supabaseUrl="${supabaseUrl.substring(0, 30)}...", key="${serviceKey.substring(0, 15)}..."`);

    // 1) raw HTTP SELECT로 존재 확인 (cache: 'no-store'로 Next.js Data Cache 우회)
    const listRes = await fetch(
      `${supabaseUrl}/rest/v1/exams?select=id,title&limit=200`,
      { method: 'GET', headers, cache: 'no-store' as RequestCache }
    );

    if (!listRes.ok) {
      console.error(`[API/exams] raw SELECT 실패: status=${listRes.status}`);
      const errText = await listRes.text();
      console.error(`[API/exams] raw SELECT body: ${errText}`);
      return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
    }

    const allExams: { id: string; title: string }[] = await listRes.json();
    console.log(`[API/exams] raw SELECT: ${allExams.length}건 조회됨`);

    const targetExam = allExams.find(e => e.id === examId);

    if (!targetExam) {
      console.log(`[API/exams] examId="${examId}" NOT found in ${allExams.length} exams`);
      console.log(`[API/exams] DB IDs: [${allExams.map(e => e.id).join(', ')}]`);
      return NextResponse.json(
        { error: '해당 시험지를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[API/exams] 삭제 대상: "${targetExam.title}" (${targetExam.id})`);

    // 2) raw HTTP DELETE 실행
    const deleteRes = await fetch(
      `${supabaseUrl}/rest/v1/exams?id=eq.${examId}`,
      {
        method: 'DELETE',
        headers: { ...headers, 'Prefer': 'return=representation' },
      }
    );

    const deleteBody = await deleteRes.text();
    console.log(`[API/exams] raw DELETE: status=${deleteRes.status}, body=${deleteBody.substring(0, 200)}`);

    if (!deleteRes.ok) {
      console.error(`[API/exams] raw DELETE 실패!`);
      return NextResponse.json(
        { error: `삭제 실패 (HTTP ${deleteRes.status})`, detail: deleteBody },
        { status: 500 }
      );
    }

    // 3) 삭제 확인: 다시 raw SELECT (cache: 'no-store')
    const verifyRes = await fetch(
      `${supabaseUrl}/rest/v1/exams?select=id&id=eq.${examId}`,
      { method: 'GET', headers, cache: 'no-store' as RequestCache }
    );
    const verifyData: { id: string }[] = await verifyRes.json();

    if (verifyData.length > 0) {
      console.error(`[API/exams] ⚠ DELETE 후에도 행 존재! RLS가 DELETE를 차단하고 있을 가능성`);
      return NextResponse.json(
        { error: 'RLS 정책이 삭제를 차단합니다. Supabase 대시보드에서 exams 테이블 RLS를 확인하세요.' },
        { status: 500 }
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
