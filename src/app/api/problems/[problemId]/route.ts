// ============================================================================
// PATCH /api/problems/[problemId] - 문제 내용 수정
// DELETE /api/problems/[problemId] - 문제 삭제
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuth, requireEditor } from '@/lib/auth/guard';

// ============================================================================
// GET /api/problems/[problemId] - 문제 단일 조회 (로그인 필수)
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  // ★ 로그인 필수 (민감 정보 아니지만 무단 스크래핑 방지)
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { problemId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from('problems')
    .select('id, content_latex, solution_latex, answer_json, images, ai_analysis, source_name, source_year')
    .eq('id', problemId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  // ★ ADMIN/TEACHER/TUTOR만 문제 수정 허용 (학생/학부모 차단)
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { problemId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { content_latex, solution_latex, answer_json, answer_json_patch, images, ai_analysis, difficulty, type_code: rawTypeCode, cognitive_domain, source_number, sequence_number, correction_reason } = body;

    // ★ type_code sanitize — UI에서 "MS09-02-03-09-12. 실생활12 (식 세우기)" 같은 표시 텍스트가
    //   통째로 들어오는 사고 차단. 정규식으로 MS코드(2~5세그먼트)만 추출.
    //   예: "MS09-02-03-09-12 실생활12..." → "MS09-02-03-09-12"
    let type_code: string | undefined = rawTypeCode;
    if (typeof rawTypeCode === 'string' && rawTypeCode.startsWith('MS')) {
      const match = rawTypeCode.match(/^MS\d{2}(?:-\d{2}){1,4}/);
      if (match) {
        type_code = match[0];
        if (match[0] !== rawTypeCode) {
          console.log(`[API/problems] type_code sanitized: "${rawTypeCode.slice(0, 60)}" → "${type_code}"`);
        }
      }
    }

    // ★ 객관식 정답 박힘 가드 — 0/모호값은 빈값으로 normalize, 정상값(① ~ ⑤·1~5)은 그대로.
    //   미입력(빈값)은 허용 — 자산화 직후 사용자 입력 대기 상태.
    //   메모리: feedback_objective_answer_safety.md
    if (answer_json && typeof answer_json === 'object') {
      const aj = answer_json as Record<string, any>;
      if (aj.type === 'multiple_choice') {
        const { normalizeObjectiveAnswer, isEmptyAnswer, isValidObjectiveAnswer } = await import('@/lib/validation/objective-answer');
        const ans = aj.correct_answer ?? aj.finalAnswer;
        if (!isEmptyAnswer(ans) && !isValidObjectiveAnswer(ans)) {
          // 모호값(0, "5번" 등) → 빈값으로 강제. 박힘 사고 차단.
          const normalized = normalizeObjectiveAnswer(ans);
          aj.correct_answer = normalized;
          aj.finalAnswer = normalized;
          console.warn(`[API/problems] objective answer normalized: ${JSON.stringify(ans)} → "${normalized}" (problemId=${problemId})`);
        }
      }
    }

    // problems 테이블 업데이트
    const updateData: Record<string, any> = {};
    if (content_latex !== undefined) updateData.content_latex = content_latex;
    if (solution_latex !== undefined) updateData.solution_latex = solution_latex;
    if (answer_json !== undefined) updateData.answer_json = answer_json;

    // ★ answer_json_patch — 기존 answer_json 의 일부 필드만 머지 (전체 덮어쓰기 방지)
    //   서술형 소문제 답·배점 인라인 저장에서 사용 (subQuestions 만 갱신).
    //   answer_json 전체 PATCH 와 충돌 시 전체가 우선.
    if (answer_json_patch !== undefined && answer_json === undefined) {
      const { data: existing } = await supabaseAdmin
        .from('problems')
        .select('answer_json')
        .eq('id', problemId)
        .maybeSingle();
      const merged = { ...((existing?.answer_json as Record<string, unknown>) || {}), ...answer_json_patch };
      updateData.answer_json = merged;
    }
    if (images !== undefined) updateData.images = images;
    if (ai_analysis !== undefined) updateData.ai_analysis = ai_analysis;
    // 문제 번호 (source_number 또는 sequence_number → source_number로 저장)
    const newNumber = source_number ?? sequence_number;
    if (newNumber !== undefined) updateData.source_number = newNumber;

    let problem = null;
    if (Object.keys(updateData).length > 0) {
      // .single() 대신 .maybeSingle() 사용 → 0행 업데이트 시 null 반환 (에러 아님)
      const { data, error } = await supabaseAdmin
        .from('problems')
        .update(updateData)
        .eq('id', problemId)
        .select('id, content_latex, solution_latex, answer_json')
        .maybeSingle();

      if (error) {
        console.error('[API/problems] Update error:', error.code, error.message);
        return NextResponse.json(
          { error: error.message, detail: error.details || error.hint || '' },
          { status: 500 }
        );
      }
      if (!data) {
        // 해당 ID의 문제가 DB에 없음 (삭제됐거나 잘못된 ID)
        console.warn('[API/problems] Problem not found:', problemId);
        return NextResponse.json(
          { error: `문제를 찾을 수 없습니다 (ID: ${problemId.slice(0, 8)}...). 페이지를 새로고침하세요.` },
          { status: 404 }
        );
      }
      problem = data;
    }

    // classifications 테이블 업데이트 (난이도, 유형코드, 인지영역)
    if (difficulty !== undefined || type_code !== undefined || cognitive_domain !== undefined) {
      // ★ Phase C-2: 분류 변경 전 before snapshot — corrections 누적용
      let beforeCode: string | null = null;
      let beforeTypeName: string | null = null;
      if (type_code !== undefined) {
        const { data: existingCls } = await supabaseAdmin
          .from('classifications')
          .select('type_code')
          .eq('problem_id', problemId)
          .maybeSingle();
        beforeCode = existingCls?.type_code || null;
        if (beforeCode && beforeCode.startsWith('MS')) {
          const { data: beforeMs } = await supabaseAdmin
            .from('mathsecr_types')
            .select('full_path')
            .eq('code', beforeCode)
            .maybeSingle();
          beforeTypeName = beforeMs?.full_path || null;
        }
      }

      const classUpdate: Record<string, any> = { is_verified: true };
      if (difficulty !== undefined) classUpdate.difficulty = String(difficulty);
      if (type_code !== undefined) classUpdate.type_code = type_code;
      if (cognitive_domain !== undefined) classUpdate.cognitive_domain = cognitive_domain;

      const { error: clsError } = await supabaseAdmin
        .from('classifications')
        .update(classUpdate)
        .eq('problem_id', problemId);

      if (clsError) {
        // classifications 레코드가 없을 수 있으므로 insert 시도
        await supabaseAdmin.from('classifications').insert({
          problem_id: problemId,
          ...classUpdate,
          classification_source: 'MANUAL',
        });
      }
      console.log(`[API/problems] Classification updated: difficulty=${difficulty}, type_code=${type_code}`);

      // ★ Phase C-2: 분류 보정 누적 — 사용자가 type_code 변경 시 학습 데이터로 INSERT
      //   다음 분류 호출에 비슷한 보정 사례를 few-shot으로 주입(classify.ts) → self-compiling.
      if (type_code !== undefined && beforeCode !== type_code) {
        try {
          const { data: probSnapshot } = await supabaseAdmin
            .from('problems')
            .select('content_latex')
            .eq('id', problemId)
            .maybeSingle();
          const { data: examLink } = await supabaseAdmin
            .from('exam_problems')
            .select('exam_id')
            .eq('problem_id', problemId)
            .limit(1)
            .maybeSingle();
          let examSubject: string | null = null;
          let examGrade: string | null = null;
          if (examLink?.exam_id) {
            const { data: examMeta } = await supabaseAdmin
              .from('exams')
              .select('subject, grade')
              .eq('id', examLink.exam_id)
              .maybeSingle();
            examSubject = examMeta?.subject || null;
            examGrade = examMeta?.grade || null;
          }
          let afterTypeName: string | null = null;
          if (type_code && type_code.startsWith('MS')) {
            const { data: afterMs } = await supabaseAdmin
              .from('mathsecr_types')
              .select('full_path')
              .eq('code', type_code)
              .maybeSingle();
            afterTypeName = afterMs?.full_path || null;
          }
          await supabaseAdmin.from('classification_corrections').insert({
            problem_id: problemId,
            problem_content: probSnapshot?.content_latex || null,
            before_code: beforeCode,
            after_code: type_code,
            before_type_name: beforeTypeName,
            after_type_name: afterTypeName,
            exam_subject: examSubject,
            exam_grade: examGrade,
            reason: correction_reason || null,
            corrected_by: guard.user?.id || null,
          });
          console.log(
            `[API/problems] ★ Correction logged: ${beforeCode || '(none)'} → ${type_code}`
          );
        } catch (e) {
          console.warn(`[API/problems] correction insert 실패:`, e);
        }
      }
    }

    // exam_problems 테이블의 sequence_number도 업데이트
    if (newNumber !== undefined) {
      const { error: seqError } = await supabaseAdmin
        .from('exam_problems')
        .update({ sequence_number: newNumber })
        .eq('problem_id', problemId);

      if (seqError) {
        console.warn(`[API/problems] exam_problems sequence_number update failed:`, seqError.message);
      } else {
        console.log(`[API/problems] sequence_number updated to ${newNumber}`);
      }
    }

    if (!problem && difficulty === undefined && type_code === undefined && newNumber === undefined) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, problem });
  } catch (err) {
    console.error('[API/problems] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/problems/[problemId] - 문제 삭제 (ADMIN/TEACHER/TUTOR)
// ============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  // ★ 편집자 role 전용 (학생/학부모가 남 문제 지우는 것 방지)
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { problemId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // 1. 분류 데이터 먼저 삭제 (외래키 관계)
    await supabaseAdmin
      .from('classifications')
      .delete()
      .eq('problem_id', problemId);

    // 2. exam_problems 연결 삭제
    await supabaseAdmin
      .from('exam_problems')
      .delete()
      .eq('problem_id', problemId);

    // 3. 문제 본체 삭제
    const { error } = await supabaseAdmin
      .from('problems')
      .delete()
      .eq('id', problemId);

    if (error) {
      console.error('[API/problems] Delete error:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete problem', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: problemId });
  } catch (err) {
    console.error('[API/problems] Delete unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
