// ============================================================================
// 시험지 AI 분석 API
// - GET  /api/exams/[examId]/ai-analysis : 캐시된 분석 조회
// - POST /api/exams/[examId]/ai-analysis : 분석 생성 + 저장 (force=true 시 재생성)
//
// AI 모델: Claude Sonnet 4.6 (prompt cache 적용)
// 분석 산출: ExamAIAnalysis JSON (시험총평/단원별/고난도)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { cachedSystem } from '@/lib/claude/cache';
import {
  EXAM_ANALYSIS_SYSTEM_PROMPT,
  buildExamAnalysisUserPrompt,
} from '@/lib/ai/exam-analysis-prompt';
import { resolveSubjectCode } from '@/lib/workflow/mathsecr-prompt';
import { detectGradeFromTitle, detectSubjectFromTitle } from '@/lib/workflow/title-detect';
import type { ExamAIAnalysis, GenerateAnalysisOptions } from '@/types/exam-ai-analysis';

// 분석은 Claude Sonnet 응답 + 길어서 5분
export const maxDuration = 300;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ============================================================================
// GET — 캐시된 분석 조회
// ============================================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabaseAdmin
    .from('exams')
    .select('id, ai_analysis')
    .eq('id', examId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  const ai = data.ai_analysis as Record<string, unknown> | null;
  const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);

  return NextResponse.json({
    analysis: hasAnalysis ? (ai as unknown as ExamAIAnalysis) : null,
  });
}

// ============================================================================
// POST — AI 분석 생성 + 저장
// ============================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateAnalysisOptions;
  const force = body.force ?? false;
  const hardThreshold = body.hardDifficultyThreshold ?? 7;
  const hardLimit = body.hardQuestionLimit ?? 4;

  // 1. 시험지 조회
  const { data: exam, error: examError } = await supabaseAdmin
    .from('exams')
    .select('id, title, grade, subject, ai_analysis')
    .eq('id', examId)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  // 2. 캐시 hit (force 아닐 때)
  const cached = exam.ai_analysis as Record<string, unknown> | null;
  if (!force && cached && 'generatedAt' in cached) {
    return NextResponse.json({ analysis: cached, fromCache: true });
  }

  // 3. 시험지에 포함된 문제 fetch
  // ★ supabaseAdmin + JOIN(!inner)은 0건 반환 이슈 있음 → 분리 쿼리 필수
  // ★ 컬럼명은 sequence_number (order_index 아님)
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('exam_problems')
    .select('sequence_number, points, problem_id')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });

  if (rowsError || !rows || rows.length === 0) {
    return NextResponse.json(
      { error: 'No problems in exam', detail: rowsError?.message },
      { status: 400 }
    );
  }

  const problemIds = rows.map((r) => r.problem_id).filter(Boolean) as string[];

  // 3-b. problems 별도 조회
  const { data: problemsData } = await supabaseAdmin
    .from('problems')
    .select('id, content_latex, answer_json, ai_analysis, source_number')
    .in('id', problemIds);

  const problemsMap = new Map<
    string,
    {
      id: string;
      content_latex: string | null;
      answer_json: Record<string, unknown> | null;
      ai_analysis: Record<string, unknown> | null;
      source_number: number | null;
    }
  >();
  (problemsData || []).forEach((p) => {
    if (p.id) problemsMap.set(p.id, p as typeof problemsMap extends Map<string, infer V> ? V : never);
  });

  // 4. 분류 + 유형명 fetch (별도 쿼리로 단순화)
  const { data: classifications } = await supabaseAdmin
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty, cognitive_domain')
    .in('problem_id', problemIds);

  const classByProblem = new Map<string, (typeof classifications)[number]>();
  (classifications || []).forEach((c) => {
    if (c.problem_id) classByProblem.set(c.problem_id, c);
  });

  // 5. expanded_math_types에서 typeName 일괄 조회
  const typeCodes = Array.from(
    new Set(
      Array.from(classByProblem.values())
        .map((c) => c.expanded_type_code || c.type_code)
        .filter(Boolean) as string[]
    )
  );
  const typeNameMap = new Map<string, string>();
  if (typeCodes.length > 0) {
    const { data: typeRows } = await supabaseAdmin
      .from('expanded_math_types')
      .select('type_code, type_name')
      .in('type_code', typeCodes);
    (typeRows || []).forEach((t) => {
      if (t.type_code) typeNameMap.set(t.type_code, t.type_name || '');
    });
  }

  // 5-A. 학년·과목 재감지 — exam.grade가 잘못 박혀있을 때 보정
  // ★ exam.grade가 "고1"로 박혔어도 title/subject에 "대수"가 있으면 detectGradeFromTitle이 "고2"로 잡음.
  //   이 effectiveGrade를 Claude 프롬프트에 전달해야 summary 텍스트에 잘못된 학년이 박히지 않음.
  //   사고 이력: 대수(고2) 시험지에 exam.grade="고1"로 저장 → Claude가 "이 시험지는 고1 수학 범위" summary 작성.
  const detectedGrade =
    detectGradeFromTitle(exam.title || '') || detectGradeFromTitle(exam.subject || '');
  const effectiveGrade = detectedGrade || exam.grade || null;
  const detectedSubject =
    detectSubjectFromTitle(exam.title || '') || detectSubjectFromTitle(exam.subject || '');
  const effectiveSubject = detectedSubject || exam.subject || null;

  // 5-B. mathsecr_types에서 majorUnit lookup — type_code prefix(MS09-01)로 정확한 대단원명 조회
  // ★ classifications.type_code(MS09=대수)는 정확하지만 problems.ai_analysis.classification.chapter는
  //   학년 무관 텍스트라 대수(고2)에 "다항식"(고1) 같은 단원명이 박히던 사고 차단.
  const examSubjectCode = resolveSubjectCode(effectiveGrade ?? undefined, effectiveSubject ?? undefined);
  const msPrefixes = Array.from(
    new Set(
      Array.from(classByProblem.values())
        .map((c) => {
          const tc = c.expanded_type_code || c.type_code;
          if (!tc || !tc.startsWith('MS')) return null;
          const parts = tc.split('-');
          return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null;
        })
        .filter((x): x is string => x !== null)
    )
  );
  const msUnitMap = new Map<string, { subjectCode: string; level1Name: string }>();
  if (msPrefixes.length > 0) {
    const { data: msRows } = await supabaseAdmin
      .from('mathsecr_types')
      .select('code, subject_code, level1_name')
      .in('code', msPrefixes);
    (msRows || []).forEach((r) => {
      if (r.code && r.level1_name) {
        msUnitMap.set(r.code, { subjectCode: r.subject_code, level1Name: r.level1_name });
      }
    });
  }

  // 6. 변환 — 분석에 필요한 형태로
  const problemsForPrompt = rows
    .map((row, idx) => {
      const p = row.problem_id ? problemsMap.get(row.problem_id) : undefined;
      if (!p) return null;
      const cls = classByProblem.get(p.id);
      const tCode = cls?.expanded_type_code || cls?.type_code || '';
      const typeName = typeNameMap.get(tCode) || '';

      // majorUnit 추출 우선순위 (학년 정합성 우선):
      //  1) mathsecr_types.level1_name — type_code prefix(MS09-01)로 정확한 대단원
      //     ★ examSubjectCode와 prefix subject_code 일치 시에만 채택 (불일치 시 fallback)
      //  2) ai_analysis.classification.chapter — OCR 텍스트 (학년 무관)
      //  3) typeName 앞부분
      //  4) '미분류'
      const msPrefix = tCode.startsWith('MS') ? tCode.split('-').slice(0, 2).join('-') : '';
      const msHit = msPrefix ? msUnitMap.get(msPrefix) : null;
      const subjectMatches =
        examSubjectCode == null || msHit == null || msHit.subjectCode === examSubjectCode;
      const aiCls = (p.ai_analysis as { classification?: { chapter?: string } } | null)
        ?.classification;
      const majorUnit =
        (msHit && subjectMatches ? msHit.level1Name : null) ||
        aiCls?.chapter ||
        (typeName ? typeName.split(/[>\-]/)[0].trim() : '') ||
        '미분류';

      const answerJson = (p.answer_json || {}) as Record<string, unknown>;
      const answer = String(
        answerJson.correct_answer || answerJson.finalAnswer || answerJson.answer || ''
      );

      return {
        number: p.source_number ?? row.sequence_number ?? idx + 1,
        problemId: p.id,
        content: p.content_latex || '',
        answer,
        difficulty: cls
          ? Math.min(10, Math.max(1, parseInt(String(cls.difficulty), 10) || 3))
          : 3,
        cognitiveDomain: cls?.cognitive_domain || 'UNDERSTANDING',
        majorUnit,
        typeName: typeName || null,
        points: row.points ? Number(row.points) : 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (problemsForPrompt.length === 0) {
    return NextResponse.json(
      { error: 'No problems data found (problems table empty)' },
      { status: 400 }
    );
  }

  // 7. 사용자 프롬프트 생성 — 보정된 effectiveGrade/effectiveSubject 사용
  const userPrompt = buildExamAnalysisUserPrompt({
    examTitle: exam.title,
    grade: effectiveGrade,
    subject: effectiveSubject,
    problems: problemsForPrompt,
    hardDifficultyThreshold: hardThreshold,
    hardQuestionLimit: hardLimit,
  });

  // 8. Claude 호출 (prompt cache 적용)
  const claudeRes = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: cachedSystem(EXAM_ANALYSIS_SYSTEM_PROMPT),
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    console.error('[exam-ai-analysis] Claude error:', claudeRes.status, errText);
    return NextResponse.json(
      { error: 'AI generation failed', detail: errText },
      { status: 502 }
    );
  }

  const claudeJson = (await claudeRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
  };
  const rawText = (claudeJson.content || [])
    .map((c) => (c.type === 'text' ? c.text || '' : ''))
    .join('')
    .trim();

  if (!rawText) {
    return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 });
  }

  // 9. JSON 파싱 (여유 있게 — ```json 블록 제거)
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let parsed: Omit<ExamAIAnalysis, 'generatedAt' | 'modelVersion'>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e1) {
    // 1차 실패 — LaTeX 수식의 백슬래시가 unescaped일 가능성. 자동 escape 후 재시도.
    // \ 다음에 valid JSON escape 문자(", \, /, b, f, n, r, t, u)가 아닌 경우 → \\로 변환
    const fixed = cleaned.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    try {
      parsed = JSON.parse(fixed);
      console.warn('[exam-ai-analysis] Recovered from invalid JSON via backslash escape fix');
    } catch (e2) {
      console.error('[exam-ai-analysis] JSON parse error (both attempts):', e1, e2, '\nRaw:', cleaned.slice(0, 800));
      return NextResponse.json(
        { error: 'AI response not valid JSON', preview: cleaned.slice(0, 500) },
        { status: 502 }
      );
    }
  }

  // 10. 결과 객체 완성
  const finalAnalysis: ExamAIAnalysis = {
    summary: parsed.summary || '',
    overallDifficulty: parsed.overallDifficulty || '보통',
    unitAnalyses: Array.isArray(parsed.unitAnalyses) ? parsed.unitAnalyses : [],
    hardQuestions: Array.isArray(parsed.hardQuestions)
      ? parsed.hardQuestions.map((hq) => {
          // problemId 채우기 — number로 매칭
          const matched = problemsForPrompt.find((p) => p.number === hq.number);
          return {
            ...hq,
            problemId: matched?.problemId || '',
          };
        })
      : [],
    generatedAt: new Date().toISOString(),
    modelVersion: ANTHROPIC_MODEL,
  };

  // 11. exams.ai_analysis 업데이트
  const { error: updateError } = await supabaseAdmin
    .from('exams')
    .update({ ai_analysis: finalAnalysis })
    .eq('id', examId);

  if (updateError) {
    console.error('[exam-ai-analysis] DB update error:', updateError);
    return NextResponse.json(
      { error: 'Failed to save analysis', detail: updateError.message, analysis: finalAnalysis },
      { status: 500 }
    );
  }

  return NextResponse.json({
    analysis: finalAnalysis,
    fromCache: false,
    usage: claudeJson.usage,
  });
}
