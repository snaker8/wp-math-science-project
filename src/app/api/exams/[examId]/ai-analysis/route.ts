// ============================================================================
// 시험지 AI 분석 API
// - GET  /api/exams/[examId]/ai-analysis : 캐시된 분석 조회
// - POST /api/exams/[examId]/ai-analysis : 분석 생성 + 저장 (force=true 시 재생성)
//
// AI 모델: Claude Sonnet 4.6 (prompt cache 적용)
// 분석 산출: ExamAIAnalysis JSON (시험총평/단원별/고난도)
// ============================================================================

import { CLAUDE_MODELS } from '@/lib/claude/model-params';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { cachedSystem } from '@/lib/claude/cache';
import {
  EXAM_ANALYSIS_SYSTEM_PROMPT,
  buildExamAnalysisUserPrompt,
} from '@/lib/ai/exam-analysis-prompt';
import { resolveSubjectCode, curriculumCodesToSubjectGrade, curriculumCodesToLabel } from '@/lib/workflow/mathsecr-prompt';
import { buildUnitFacts, formatUnitFactsForPrompt, reconcileUnitAnalyses, reconcileSummaryCounts, judgeOverallDifficulty } from '@/lib/ai/unit-facts';
import { detectGradeFromTitle, detectSubjectFromTitle } from '@/lib/workflow/title-detect';
import { resolveExamGrade } from '@/lib/workflow/exam-grade';
import type { ExamAIAnalysis, GenerateAnalysisOptions } from '@/types/exam-ai-analysis';
import { verifyAndFixStrategy } from '@/lib/ai/strategy-verify';
import { readFigureFacts } from '@/lib/vision/image-redraw';

// 분석은 Claude Sonnet 응답 + 길어서 5분
export const maxDuration = 300;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = CLAUDE_MODELS.SONNET;
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
    .select('id, title, grade, subject, curriculum_codes, ai_analysis')
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
    .select('id, content_latex, answer_json, ai_analysis, source_number, solution_latex, images')
    .in('id', problemIds);

  const problemsMap = new Map<
    string,
    {
      id: string;
      content_latex: string | null;
      answer_json: Record<string, unknown> | null;
      ai_analysis: Record<string, unknown> | null;
      source_number: number | null;
      solution_latex?: string | null;
      images?: Array<{ url?: string; type?: string }> | null;
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

  const classByProblem = new Map<string, NonNullable<typeof classifications>[number]>();
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
  // ★ curriculum_codes(자산화 때 사용자가 직접 고른 과목, 예 ["09"]=대수) 최우선 — 제목/파일명에
  //   학년·과목이 안 박힌 시험지("26-2-1-F 주례여고")가 stale 한 exam.grade("고1")·title-detect 폴백으로
  //   총평에 "고1 공통수학1" 박히던 사고 차단. curriculum_codes 없으면 기존 로직 폴백(회귀 0).
  const currMeta = curriculumCodesToSubjectGrade(exam.curriculum_codes as string[] | null);
  const detectedGrade =
    detectGradeFromTitle(exam.title || '') || detectGradeFromTitle(exam.subject || '');
  // ★ 선택과목은 제목 학년 우선 (exam-grade.ts, 2026-10-07 양운고 기하 '고3' 사고) — 종전 currMeta.grade 최우선은 중등·공통수학에서만 그대로
  const effectiveGrade = resolveExamGrade(exam.curriculum_codes as string[] | null, exam.title || '') || detectedGrade || exam.grade || null;
  const detectedSubject =
    detectSubjectFromTitle(exam.title || '') || detectSubjectFromTitle(exam.subject || '');
  const effectiveSubject = currMeta?.subject || detectedSubject || exam.subject || null;

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
      // ★ resolveSubjectCode 는 학기 불명/학기 흡수로 **배열**(['03','04'])을 돌려준다(2026-06-12~).
      //   문자열 === 비교라 중학교 시험지는 전부 불일치 → 대단원이 '미분류'로 떨어지던 사고 (2026-10-07 센텀중 21/21 미분류).
      const subjectMatches =
        examSubjectCode == null || msHit == null ||
        (Array.isArray(examSubjectCode) ? examSubjectCode.includes(msHit.subjectCode) : msHit.subjectCode === examSubjectCode);
      const aiCls = (p.ai_analysis as { classification?: { chapter?: string } } | null)
        ?.classification;
      // ★ 수학비서 typeName("중2-2 > 여러가지 사각형 > …")의 둘째 마디가 대단원 — msHit 가 없거나 과목이 어긋나도 쓸 수 있는 2차 근거
      const msTypeName = (p.ai_analysis as { classification?: { typeName?: string } } | null)?.classification?.typeName || '';
      const msTypeNameUnit = msTypeName.includes('>') ? (msTypeName.split('>')[1] || '').trim() : '';
      const majorUnit =
        (msHit && subjectMatches ? msHit.level1Name : null) ||
        msTypeNameUnit ||
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
        solution: (p.solution_latex || '').trim() || undefined,
        hasFigure: false,
        figureFacts: undefined as string | undefined,
        difficulty: cls
          ? Math.min(10, Math.max(1, parseInt(String(cls.difficulty), 10) || 3))
          : 3,
        cognitiveDomain: cls?.cognitive_domain || 'UNDERSTANDING',
        majorUnit,
        // ★ 단원의 학기(중1-1 등) — 유형 코드 과목으로. 시험 범위가 두 학기에 걸친 걸 총평이 알게 (2026-10-14 동백중 1-2 중간)
        semester: msHit ? (curriculumCodesToLabel([msHit.subjectCode]) || null) : null,
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

  // ★ 6.5 고난도 후보 문항의 그림을 메시지에 첨부 (2026-10-12 대표 "틀린 풀이가 리포트에") — 텍스트만 보고 각을 분해하던 사고
  //   난이도 ≥ 임계값 문항 중 상위 8개까지. 그림 URL: 재작성/업스케일본 > figure_crop > crop. 4MB 초과는 건너뜀.
  const figureBlocks: Array<Record<string, unknown>> = [];
  const figureById = new Map<string, { mediaType: string; data: string }>();
  const factsById = new Map<string, string>();
  let loadFigureForLazy: ((p: (typeof problemsForPrompt)[number]) => Promise<void>) | null = null;
  {
    const loadImage = async (url: string): Promise<{ mediaType: string; data: string } | null> => {
      try {
        const m = url.match(/^\/api\/storage\/image\?path=([^&]+)/);
        let buf: ArrayBuffer | null = null; let mediaType = 'image/png';
        if (m && supabaseAdmin) {
          const { data } = await supabaseAdmin.storage.from('source-files').download(decodeURIComponent(m[1]));
          if (data) { buf = await data.arrayBuffer(); mediaType = data.type || mediaType; }
        } else if (/^https?:\/\//.test(url)) {
          const res = await fetch(url);
          if (res.ok) { buf = await res.arrayBuffer(); mediaType = res.headers.get('content-type')?.split(';')[0] || mediaType; }
        }
        if (!buf || buf.byteLength > 4 * 1024 * 1024) return null;
        if (!/^image\/(png|jpeg|webp|gif)$/.test(mediaType)) mediaType = 'image/png';
        return { mediaType, data: Buffer.from(buf).toString('base64') };
      } catch { return null; }
    };
    // ★ 2026-10-13 사고: `difficulty >= hardThreshold(7)` 로 걸러 중1 시험지(난이도 2~6)는 그림이 0장 — 생성·검산이 전부 글만 보고 돌았다.
    //   임계값과 무관하게 난이도 상위 max(8, hardLimit×2) 문항의 그림을 붙인다.
    const candidates = [...problemsForPrompt]
      .sort((a, b) => b.difficulty - a.difficulty)
      .slice(0, Math.max(8, hardLimit * 2));
    const loadFigureFor = async (p: (typeof problemsForPrompt)[number]): Promise<void> => {
      if (figureById.has(p.problemId)) return;
      const row = problemsMap.get(p.problemId);
      const ai = (row?.ai_analysis || {}) as Record<string, unknown>;
      const imgs = Array.isArray(row?.images) ? (row!.images as Array<{ url?: string; type?: string }>) : [];
      // ★ 분석엔 **원본 스캔 그림**을 준다 (2026-10-13): 재작성·업스케일본은 라벨(E·J)이나 표시가 빠질 수 있어
      //   모델이 "정삼각형"처럼 없는 도형을 가정했다(동백중 15번). 원본 figure_crop > 문제 전체 crop > 재작성본.
      const url = imgs.find((i) => i.type === 'figure_crop' && i.url)?.url
        || imgs.find((i) => i.type === 'crop' && i.url)?.url
        || (typeof ai.upscaledCropUrl === 'string' && ai.upscaledCropUrl ? ai.upscaledCropUrl : undefined);
      if (!url) return;
      if (!url) return;
      const img = await loadImage(url);
      if (!img) return;
      figureById.set(p.problemId, img);
      p.hasFigure = true;
      // ★ 그림 사실 판독 (Flash ~1~2원) — 본문 OCR 에 없는 각도·점 위치를 글로 (2026-10-13)
      try {
        const facts = await readFigureFacts(Buffer.from(img.data, 'base64'), img.mediaType);
        if (facts) { factsById.set(p.problemId, facts); p.figureFacts = facts; }
      } catch { /* 판독 실패는 무시 */ }
      figureBlocks.push({ type: 'text', text: `[그림 ${p.number}] — ${p.number}번 문항의 그림` });
      figureBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    };
    for (const p of candidates) await loadFigureFor(p);
    console.log(`[exam-ai-analysis] 고난도 후보 ${candidates.length}문항 중 그림 ${figureBlocks.length / 2}장 첨부, 판독 ${factsById.size}건`);
    // 검산 단계에서 후보 밖 문항이 고난도로 뽑히면 그때 불러오도록 보관
    loadFigureForLazy = loadFigureFor;
  }

  // ★ 6.7 단원별 문항 수 확정 표 — 총평·단원 카드의 숫자는 전부 여기서 나온다 (AI 가 세지 않는다)
  const unitFacts = buildUnitFacts(problemsForPrompt.map((p) => ({ number: p.number, majorUnit: p.majorUnit, semester: p.semester })));
  const unitFactsText = formatUnitFactsForPrompt(unitFacts, problemsForPrompt.length);
  // ★ 총평 난이도 라벨도 서버가 정한다 (2026-10-16 "난이도가 4가 넘는데 보통이 맞나" — AI 가 기준 빈틈을 제멋대로 메우던 것)
  const judged = judgeOverallDifficulty(problemsForPrompt.map((p) => p.difficulty));
  const overallDifficultyText = `# 총평 난이도(서버 판정): ${judged.label} — 평균 ${judged.avg}, 난이도 7 이상 ${judged.pct7}%. overallDifficulty 는 이 값을 그대로 쓸 것.`;

  // ★ 6.8 고난도 문항은 서버가 확정 (2026-10-17 상당중 "13번이 첫 리포트엔 있다가 재생성하니 아예 빠졌다") —
  //   AI 가 고르게 두면 재생성마다 문항이 바뀐다. 난이도 내림차순(같으면 뒤 번호 먼저) 상위 hardLimit 개로 고정.
  const hardNumbers = [...problemsForPrompt]
    .sort((a, b) => (b.difficulty - a.difficulty) || (b.number - a.number))
    .slice(0, hardLimit)
    .map((p) => p.number)
    .sort((a, b) => a - b);
  const answersMissing = problemsForPrompt.filter((p) => hardNumbers.includes(p.number) && !p.answer).map((p) => p.number);
  if (answersMissing.length) console.warn(`[exam-ai-analysis] 고난도 문항 정답 없음: ${answersMissing.join(',')} — 검산이 기준 답 없이 돈다`);

  // 7. 사용자 프롬프트 생성 — 보정된 effectiveGrade/effectiveSubject 사용
  const userPrompt = buildExamAnalysisUserPrompt({
    examTitle: exam.title,
    grade: effectiveGrade,
    subject: effectiveSubject,
    problems: problemsForPrompt,
    hardDifficultyThreshold: hardThreshold,
    hardQuestionLimit: hardLimit,
    unitFactsText,
    overallDifficultyText,
    hardNumbers,
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
      max_tokens: 24000, // ★ 2026-10-07 양운고 기하(19문항·긴 수식) 가 8192 에서 잘려 JSON 파싱 실패 → 여유. 2026-10-13 thinking 몫 포함
      // ★ 2026-10-13 대표 "왜 저번보다 분석이 약하냐" — 5.5 는 thinking 을 명시해야 깊게 푼다. 고난도 공략 정확도가 생명이라 high.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: cachedSystem(EXAM_ANALYSIS_SYSTEM_PROMPT),
      // ★ 그림 블록 + 텍스트 (그림이 없으면 텍스트만 — 종전과 동일)
      messages: [{ role: 'user', content: figureBlocks.length ? [...figureBlocks, { type: 'text', text: userPrompt }] : userPrompt }],
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
  const stopReason = (claudeJson as { stop_reason?: string }).stop_reason;
  console.log(`[exam-ai-analysis] claude stop=${stopReason} in=${claudeJson.usage?.input_tokens ?? '-'} out=${claudeJson.usage?.output_tokens ?? '-'} len=${rawText.length}`);
  if (stopReason === 'max_tokens') {
    return NextResponse.json({ error: `AI 응답이 출력 한도에서 잘렸습니다 (출력 ${claudeJson.usage?.output_tokens ?? '?'} 토큰). 다시 시도해 주세요.` }, { status: 502 });
  }

  if (!rawText) {
    return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 });
  }

  // 9. JSON 파싱 (여유 있게 — ```json 블록 제거 + 앞뒤 설명문이 붙어도 첫 { ~ 마지막 } 만)
  let cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (!cleaned.startsWith('{')) {
    const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}');
    if (s >= 0 && e > s) cleaned = cleaned.slice(s, e + 1);
  }

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

  // ★ 9.5 공략 검산 (2026-10-12) — 문항마다 공략대로 실제로 풀어 정답과 대조. 틀리면 1회 재작성 → 재검산.
  //   검증 못 하면 strategyVerified=false → 학부모 리포트는 공략을 숨긴다. 문항당 Sonnet 1~2회(≈10~25원).
  // ★ 서버 확정 목록으로 되맞춤 — 목록 밖 문항은 버리고, 순서는 번호순. (AI 가 빼먹은 문항은 로그로만 — 빈 공략을 만들지 않는다)
  const hardRawAll = Array.isArray(parsed.hardQuestions) ? parsed.hardQuestions : [];
  const hardRaw = hardNumbers
    .map((n) => hardRawAll.find((h: { number?: number }) => h.number === n))
    .filter((h): h is NonNullable<typeof h> => !!h);
  {
    const extra = hardRawAll.filter((h: { number?: number }) => !hardNumbers.includes(h.number as number)).map((h: { number?: number }) => h.number);
    const missing = hardNumbers.filter((n) => !hardRaw.some((h: { number?: number }) => h.number === n));
    if (extra.length || missing.length) console.warn(`[exam-ai-analysis] 고난도 보정 — 확정=${hardNumbers.join(',')} 버림=${extra.join(',') || '-'} 누락=${missing.join(',') || '-'}`);
  }
  const verifiedHard: ExamAIAnalysis['hardQuestions'] = [];
  let verifyCalls = 0;
  for (const hq of hardRaw) {
    const matched = problemsForPrompt.find((p) => p.number === hq.number);
    const base = { ...hq, problemId: matched?.problemId || '' };
    if (!matched || !hq.strategy) { verifiedHard.push(base); continue; }
    // ★ 후보 밖 문항이 고난도로 뽑혔으면 지금 그림·판독을 불러온다 (검산은 반드시 그림을 보고)
    if (!figureById.has(matched.problemId) && loadFigureForLazy) { try { await loadFigureForLazy(matched); } catch { /* ignore */ } }
    const r = await verifyAndFixStrategy({
      number: matched.number,
      content: matched.content,
      answer: matched.answer,
      solution: matched.solution || '',
      strategy: hq.strategy,
      image: figureById.get(matched.problemId),
      figureFacts: factsById.get(matched.problemId),
    }, ANTHROPIC_API_KEY);
    verifyCalls += r.calls;
    console.log(`[exam-ai-analysis] 공략 검산 ${matched.number}번: ${r.verified ? (r.revised ? '재작성 통과' : '통과') : '실패'} (답 ${r.derivedAnswer || '?'} / 정답 ${matched.answer || '-'})${r.issue ? ' — ' + r.issue.slice(0, 120) : ''}`);
    verifiedHard.push({
      ...base,
      strategy: r.strategy,
      strategyVerified: r.verified,
      strategyIssue: r.issue,
      strategyRevised: r.revised,
      strategyDerivedAnswer: r.derivedAnswer,
    });
  }
  console.log(`[exam-ai-analysis] 공략 검산 호출 ${verifyCalls}회`);

  // 9.5 단원 카드·총평 숫자를 확정 표로 맞춘다 — AI 가 두 군데서 따로 센 수가 어긋나던 사고(동백중 8 vs 9문항) 차단
  const recon = reconcileUnitAnalyses(Array.isArray(parsed.unitAnalyses) ? parsed.unitAnalyses : [], unitFacts);
  const summaryFix = reconcileSummaryCounts(parsed.summary || '', unitFacts);
  if (recon.dropped.length || recon.added.length || summaryFix.fixed) {
    console.warn(`[exam-ai-analysis] 단원 보정 — 버림=${recon.dropped.join('/') || '-'} 채움=${recon.added.join('/') || '-'} 총평 숫자 수정=${summaryFix.fixed}`);
  }

  // 10. 결과 객체 완성
  const finalAnalysis: ExamAIAnalysis = {
    summary: summaryFix.text,
    overallDifficulty: judged.label,   // ★ AI 값 무시 — 서버 판정이 유일한 출처
    unitAnalyses: recon.result,
    hardQuestions: verifiedHard,
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

// ============================================================================
// PATCH — 고난도 공략 선생님 확정 (2026-10-13 대표: 검산에서 떨어진 15번 "아예 생성도 안 됐는데?")
//   body: { number, strategy?, action: 'approve' | 'hide' }
//   approve: (수정한) 공략을 저장하고 strategyVerified=true·strategyManual=true → 리포트에 표시
//   hide:    strategyVerified=false → 리포트에서 숨김
// ============================================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await request.json().catch(() => ({}))) as { number?: number; strategy?: string; action?: string };
  const number = Number(body.number);
  const action = body.action === 'hide' ? 'hide' : 'approve';
  if (!Number.isFinite(number)) return NextResponse.json({ error: 'number 필요' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('exams').select('ai_analysis').eq('id', examId).single();
  if (error || !data) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  const ai = (data.ai_analysis || {}) as ExamAIAnalysis;
  if (!Array.isArray(ai.hardQuestions)) return NextResponse.json({ error: '분석이 없습니다' }, { status: 400 });
  const idx = ai.hardQuestions.findIndex((q) => q.number === number);
  if (idx < 0) return NextResponse.json({ error: '해당 문항이 고난도 목록에 없습니다' }, { status: 404 });

  const q = ai.hardQuestions[idx];
  const strategy = typeof body.strategy === 'string' && body.strategy.trim() ? body.strategy.trim() : q.strategy;
  ai.hardQuestions[idx] = action === 'approve'
    ? { ...q, strategy, strategyVerified: true, strategyManual: true, strategyIssue: '', strategyRevised: q.strategyRevised }
    : { ...q, strategyVerified: false, strategyManual: true, strategyIssue: '선생님이 숨김' };

  const { error: upErr } = await supabaseAdmin.from('exams').update({ ai_analysis: ai }).eq('id', examId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ analysis: ai });
}
