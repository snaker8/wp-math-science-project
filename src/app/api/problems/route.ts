// ============================================================================
// POST /api/problems - 유사문제(Twin) 자산화: 새 문제를 DB에 저장
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertProblemAccess } from '@/lib/security/institute-guard';

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      contentLatex,
      solutionLatex,
      answer,
      choices,
      originalProblemId,
      typeCode,
      difficulty,
      cognitiveDomain,
    } = body as {
      contentLatex: string;
      solutionLatex?: string;
      answer?: string;
      choices?: string[];
      originalProblemId: string;
      typeCode?: string;
      difficulty?: number | string;
      cognitiveDomain?: string;
    };

    if (!contentLatex || !originalProblemId) {
      return NextResponse.json(
        { error: 'contentLatex and originalProblemId are required' },
        { status: 400 }
      );
    }

    // ─── 원본 문제 격리 가드 (공통 풀 = NULL 은 통과) ───
    const guard = await assertProblemAccess(supabaseAdmin, originalProblemId, scope);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    // ─── 원본 문제에서 institute_id, created_by 상속 ───
    let instituteId: string | null = null;
    let createdBy: string | null = null;

    const { data: originalProblem } = await supabaseAdmin
      .from('problems')
      .select('institute_id, created_by, subject_track')
      .eq('id', originalProblemId)
      .single();

    let originalSubjectTrack: 'math' | 'science' | null = null;
    if (originalProblem) {
      instituteId = originalProblem.institute_id;
      createdBy = originalProblem.created_by;
      const rawTrack = (originalProblem as { subject_track?: unknown }).subject_track;
      if (rawTrack === 'math' || rawTrack === 'science') {
        originalSubjectTrack = rawTrack;
      }
    }

    // ─── 1. problems 테이블 INSERT ───
    const answerJson = {
      type: (choices && choices.length > 0) ? 'multiple_choice' : 'short_answer',
      correct_answer: answer || '',
      finalAnswer: answer || '',
      choices: choices || [],
    };

    const insertData: Record<string, any> = {
      content_latex: contentLatex,
      solution_latex: solutionLatex || '',
      answer_json: answerJson,
      status: 'PENDING_REVIEW',
      source_name: `유사문제 (원본: ${originalProblemId.slice(0, 8)}...)`,
      ai_analysis: {
        source: 'twin_generation',
        originalProblemId,
        generatedAt: new Date().toISOString(),
      },
      images: [],
      tags: [],
    };

    if (instituteId) insertData.institute_id = instituteId;
    if (createdBy) insertData.created_by = createdBy;
    // ★ 트랙 상속 — 원본 problem 의 subject_track 을 유사문제에 그대로 부여.
    //   feature flag false 여도 컬럼은 채워둠. 미상속 (NULL/invalid) 시 DB DEFAULT 'math' 자동 적용.
    if (originalSubjectTrack) {
      insertData.subject_track = originalSubjectTrack;
    }

    const { data: newProblem, error: problemError } = await supabaseAdmin
      .from('problems')
      .insert(insertData)
      .select('id')
      .single();

    if (problemError || !newProblem) {
      console.error('[API/problems POST] Insert error:', problemError?.message);
      return NextResponse.json(
        { error: 'Failed to insert problem', detail: problemError?.message },
        { status: 500 }
      );
    }

    // ─── 2. classifications 테이블 INSERT ───
    if (typeCode) {
      const diffStr = difficulty ? String(difficulty) : '3';
      const domain = cognitiveDomain || 'CALCULATION';

      const { error: clsError } = await supabaseAdmin
        .from('classifications')
        .insert({
          problem_id: newProblem.id,
          type_code: typeCode,
          difficulty: diffStr,
          cognitive_domain: domain,
          ai_confidence: 0.9,
          is_verified: false,
          classification_source: 'TWIN',
        });

      if (clsError) {
        console.warn('[API/problems POST] Classification insert warning:', clsError.message);
      }
    }

    // ★ exam_problems에는 INSERT하지 않음 — 유사문제는 시험지에 속하지 않고 문제은행에만 독립 저장
    console.log(`[API/problems POST] Twin problem saved to bank: ${newProblem.id} (original: ${originalProblemId})`);

    return NextResponse.json({
      success: true,
      problemId: newProblem.id,
      message: '유사문제가 문제은행에 저장되었습니다.',
    });
  } catch (err) {
    console.error('[API/problems POST] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
