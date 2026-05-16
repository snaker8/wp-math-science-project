// ============================================================================
// POST /api/exams/[examId]/match-answers — 빠른답/해설 파일 업로드 → OCR → 매칭 미리보기
// PUT  /api/exams/[examId]/match-answers — 확인된 매칭 적용 → DB 업데이트
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { parseAnswerDocument, type ParsedAnswer } from '@/lib/ocr/answer-parser';

const MATHPIX_APP_ID = process.env.MATHPIX_APP_ID || '';
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY || '';
const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

export const maxDuration = 300;

// ============================================================================
// POST: 파일 업로드 → OCR → 파싱 → 매칭 미리보기
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

  try {
    const formData = await request.formData();
    // 다중 파일 지원 — 이름 오름차순 정렬(page-001, page-002... 순서 보장)
    const uploadedFiles = (formData.getAll('file') as File[])
      .filter((f): f is File => !!f && typeof f.name === 'string')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    // 'solution' 선택 시 파일 크기·형식 무관 Mathpix로 강제 (해설 블록 추출 필요)
    const docType = (formData.get('docType') as string) === 'solution' ? 'solution' : 'quick_answer';

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }
    if (uploadedFiles.length > 10) {
      return NextResponse.json({ error: '파일은 최대 10개까지 업로드 가능합니다.' }, { status: 400 });
    }

    // 1. 시험지 문제 목록 조회
    const { data: examProblems } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number');

    if (!examProblems || examProblems.length === 0) {
      return NextResponse.json({ error: '시험지에 문제가 없습니다.' }, { status: 404 });
    }

    const problemIds = examProblems.map(ep => ep.problem_id);
    const seqMap = new Map(examProblems.map(ep => [ep.sequence_number, ep.problem_id]));

    // 기존 문제 데이터 조회
    const { data: problems } = await supabaseAdmin
      .from('problems')
      .select('id, answer_json, solution_latex, content_latex')
      .in('id', problemIds);

    const problemMap = new Map((problems || []).map(p => [p.id, p]));

    // 2. 파일별 OCR / Vision 병렬 추출 → 결과 병합
    //    - Gemini 경로(이미지/짧은 PDF): ParsedAnswer[] 직접 누적
    //    - Mathpix 경로(긴 PDF/이미지): OCR 텍스트 누적 후 마지막에 parseAnswerDocument 한 번 호출
    const answerMap = new Map<number, import('@/lib/ocr/answer-parser').ParsedAnswer>();
    const solutionMap = new Map<number, import('@/lib/ocr/answer-parser').ParsedSolution>();
    const rawTextParts: string[] = [];
    let hasMathpixText = false;
    let mathpixDetectedType: 'quick_answer' | 'solution' | 'mixed' | 'unknown' = 'unknown';

    type FileResult =
      | { file: string; kind: 'gemini-answer'; answers: import('@/lib/ocr/answer-parser').ParsedAnswer[] }
      | { file: string; kind: 'gemini-solution'; answers: import('@/lib/ocr/answer-parser').ParsedAnswer[]; solutions: import('@/lib/ocr/answer-parser').ParsedSolution[] }
      | { file: string; kind: 'mathpix'; text: string };

    const tasks = uploadedFiles.map(async (file): Promise<FileResult> => {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      const isShortPdf = isPdf && file.size <= 200 * 1024;
      console.log(`[match-answers] 추출 시작: ${file.name} (${file.size} bytes, docType=${docType})`);

      if (docType === 'solution') {
        // 해설: Gemini Vision으로 답+해설 동시 추출 (Mathpix 타임아웃 회피)
        const { answers, solutions } = await extractSolutionsWithGemini(file);
        console.log(`[match-answers]   Gemini(solution) ${file.name}: 답 ${answers.length}개, 해설 ${solutions.length}개`);
        return { file: file.name, kind: 'gemini-solution', answers, solutions };
      } else if (!isPdf || isShortPdf) {
        // 빠른답 + 짧은 PDF/이미지: Gemini 답 추출
        const answers = await extractAnswersWithGemini(file);
        console.log(`[match-answers]   Gemini(answer) ${file.name}: ${answers.length}개 답`);
        return { file: file.name, kind: 'gemini-answer', answers };
      } else {
        // 빠른답 + 긴 PDF: Mathpix (기존 경로)
        const text = isPdf ? await ocrPdf(file) : await ocrImage(file);
        console.log(`[match-answers]   Mathpix ${file.name}: ${text.length}자`);
        return { file: file.name, kind: 'mathpix', text };
      }
    });

    const settled = await Promise.allSettled(tasks);

    // 실패·성공 분리, 일부 실패해도 나머지는 살림
    const failed: string[] = [];
    let mathpixMergedText = '';
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const fileName = uploadedFiles[i].name;
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[match-answers]   실패 ${fileName}: ${msg}`);
        failed.push(`${fileName} (${msg})`);
        continue;
      }
      const v = r.value;
      if (v.kind === 'gemini-answer') {
        for (const a of v.answers) answerMap.set(a.problemNumber, a);
        rawTextParts.push(`--- ${v.file} ---\n` + v.answers.map(a => `${a.problemNumber}. ${a.answer}`).join('\n'));
      } else if (v.kind === 'gemini-solution') {
        for (const a of v.answers) answerMap.set(a.problemNumber, a);
        // 해설은 페이지 경계를 가로지르는 경우가 있어 병합 — 같은 문제번호면 텍스트 이어붙임
        for (const s of v.solutions) {
          const existing = solutionMap.get(s.problemNumber);
          if (existing && existing.solutionLatex && s.solutionLatex) {
            solutionMap.set(s.problemNumber, {
              problemNumber: s.problemNumber,
              solutionLatex: existing.solutionLatex + '\n' + s.solutionLatex,
            });
          } else {
            solutionMap.set(s.problemNumber, s);
          }
        }
        rawTextParts.push(`--- ${v.file} ---\n답: ${v.answers.length}개 / 해설: ${v.solutions.length}개`);
      } else {
        if (v.text && v.text.trim().length >= 10) {
          mathpixMergedText += (mathpixMergedText ? '\n\n' : '') + v.text;
          rawTextParts.push(`--- ${v.file} ---\n` + v.text.slice(0, 200));
          hasMathpixText = true;
        }
      }
    }

    // Mathpix로 받은 긴 PDF들은 합쳐서 한 번에 파싱 (섹션 감지 정확도↑)
    if (hasMathpixText) {
      const parsed = parseAnswerDocument(mathpixMergedText);
      for (const a of parsed.answers) answerMap.set(a.problemNumber, a);
      for (const s of parsed.solutions) solutionMap.set(s.problemNumber, s);
      mathpixDetectedType = parsed.detectedType;
    }

    if (answerMap.size === 0 && solutionMap.size === 0) {
      const failMsg = failed.length > 0 ? ` (실패: ${failed.join(', ')})` : '';
      return NextResponse.json({ error: `파일에서 답/해설을 찾지 못했습니다.${failMsg}` }, { status: 400 });
    }

    // detectedType 결정: 해설 모드이거나 solutionMap이 차있으면 solution/mixed, 그 외 quick_answer
    const detectedType: 'quick_answer' | 'solution' | 'mixed' | 'unknown' =
      hasMathpixText
        ? mathpixDetectedType
        : docType === 'solution' || solutionMap.size > 0
          ? (answerMap.size > 0 ? 'mixed' : 'solution')
          : 'quick_answer';

    const parseResult = {
      answers: Array.from(answerMap.values()).sort((a, b) => a.problemNumber - b.problemNumber),
      solutions: Array.from(solutionMap.values()).sort((a, b) => a.problemNumber - b.problemNumber),
      rawText: rawTextParts.join('\n\n'),
      detectedType,
    };

    console.log(`[match-answers] 전체 파싱 결과: type=${parseResult.detectedType}, answers=${parseResult.answers.length}, solutions=${parseResult.solutions.length}`);

    // 4. 매칭 미리보기 생성
    const matches: Array<{
      problemNumber: number;
      problemId: string;
      currentAnswer: string;
      newAnswer: string;
      currentSolution: string;
      newSolution: string;
      hasChange: boolean;
    }> = [];

    for (const [seqNum, problemId] of seqMap) {
      const problem = problemMap.get(problemId);
      if (!problem) continue;

      const answerJson = (problem.answer_json || {}) as Record<string, unknown>;
      const currentAnswer = String(answerJson.finalAnswer || answerJson.correct_answer || '');
      const currentSolution = problem.solution_latex || '';

      const matchedAnswer = parseResult.answers.find(a => a.problemNumber === seqNum);
      const matchedSolution = parseResult.solutions.find(s => s.problemNumber === seqNum);

      const newAnswer = matchedAnswer?.answer || '';
      const newSolution = matchedSolution?.solutionLatex || '';
      const hasChange = Boolean((newAnswer && newAnswer !== currentAnswer) || (newSolution && newSolution !== currentSolution));

      matches.push({
        problemNumber: seqNum,
        problemId,
        currentAnswer,
        newAnswer,
        // ★ slice 금지 — 이 값이 그대로 PUT으로 되돌아가 DB 저장됨
        currentSolution,
        newSolution,
        hasChange,
      });
    }

    const changedCount = matches.filter(m => m.hasChange).length;

    return NextResponse.json({
      examId,
      detectedType: parseResult.detectedType,
      totalProblems: examProblems.length,
      parsedAnswers: parseResult.answers.length,
      parsedSolutions: parseResult.solutions.length,
      changedCount,
      matches,
      rawTextPreview: parseResult.rawText.slice(0, 500),
    });

  } catch (error) {
    console.error('[match-answers] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT: 확인된 매칭 적용
// ============================================================================

export async function PUT(
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

  try {
    const body = await request.json();
    const { matches } = body as { matches: Array<{ problemId: string; newAnswer?: string; newSolution?: string }> };

    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: '매칭 데이터가 없습니다.' }, { status: 400 });
    }

    let updatedCount = 0;

    for (const match of matches) {
      if (!match.newAnswer && !match.newSolution) continue;

      // 기존 데이터 조회
      const { data: problem } = await supabaseAdmin
        .from('problems')
        .select('answer_json, solution_latex')
        .eq('id', match.problemId)
        .single();

      if (!problem) continue;

      const updates: Record<string, unknown> = {};

      // 빠른답 업데이트 — 수동 업로드이므로 보호 플래그 설정
      const answerJson = (problem.answer_json || {}) as Record<string, unknown>;
      const mergedAj: Record<string, unknown> = { ...answerJson };

      if (match.newAnswer) {
        // ★ 객관식 박힘 차단 — 0/모호값은 빈값으로 normalize.
        //   메모리: feedback_objective_answer_safety.md
        // ★ 보완 (2026-05-15): OCR 결과가 객관식 형식(①~⑤/1~5)인 경우에만
        //   객관식 normalize 적용. 그 외(숫자 65, 분수 1/2 등) 는 단답 의도로
        //   판단하고 그대로 박음. 메모리 가드(객관식 모호값 차단) 는 유지하되,
        //   OCR 이 명확한 단답을 추출한 경우 빈값 강등 사고 방지.
        const trimmedAns = match.newAnswer.trim();
        const looksObjective = /^[①②③④⑤]$/.test(trimmedAns) || /^[1-5]$/.test(trimmedAns);
        const problemIsObjective = mergedAj.type === 'multiple_choice'
          || (Array.isArray(mergedAj.choices) && (mergedAj.choices as unknown[]).length > 0);
        const safeAns = (problemIsObjective && looksObjective)
          ? (await import('@/lib/validation/objective-answer')).normalizeObjectiveAnswer(match.newAnswer)
          : match.newAnswer;
        mergedAj.finalAnswer = safeAns;
        mergedAj.correct_answer = safeAns;
        mergedAj.answer_user_edited = true;    // ★ 일괄 재생성이 안 건드리도록
        mergedAj.uploaded_at = new Date().toISOString();
      }

      // 해설 업데이트 — 수동 업로드이므로 보호 플래그 설정
      if (match.newSolution) {
        updates.solution_latex = match.newSolution;
        mergedAj.solution_user_edited = true;  // ★ 일괄 재생성이 안 건드리도록
        mergedAj.uploaded_at = new Date().toISOString();
      }

      if (match.newAnswer || match.newSolution) {
        updates.answer_json = mergedAj;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabaseAdmin
          .from('problems')
          .update(updates)
          .eq('id', match.problemId);

        if (!error) updatedCount++;
        else console.error(`[match-answers] 문제 ${match.problemId} 업데이트 실패:`, error.message);
      }
    }

    return NextResponse.json({
      examId,
      updatedCount,
      totalMatches: matches.length,
    });

  } catch (error) {
    console.error('[match-answers] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Gemini Vision — 이미지에서 빠른답 직접 추출 (Mathpix보다 정확)
// 사용자의 답추출기(ClassIn Maker)와 동일 모델/프롬프트 사용
// ============================================================================

const CIRCLED_TO_DIGIT: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
};

async function extractAnswersWithGemini(file: File): Promise<ParsedAnswer[]> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  // 확장자로 PDF 감지 (file.type 비어있는 브라우저 대응)
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');

  const prompt = `이 파일에서 정답표(정답지)를 찾아서 텍스트로 추출해줘. 문제 번호와 정답을 각 줄에 하나씩 나열해. 형식은 '문제번호. 정답' (예: 1. ①, 2. 5, 3. -1, 4. 1/2, 5. 해설참조) 형태로 해줘. 마지막 문항까지 빠짐없이 모두 추출해.

[중요 원칙]
1. 객관식 정답이 원문자(①, ②, ③, ④, ⑤)로 되어 있다면 반드시 해당 특수문자를 그대로 사용해. 절대 (1)이나 1로 바꾸지 마.
2. '해설참조', '별도첨부' 같이 텍스트로 된 정답도 절대 생략하지 말고 그대로 적어.
3. 수식은 LaTeX 포맷($...$)을 절대 쓰지 마. 대신 유니코드 기호(√, ³, ², /, π 등)를 사용하여 사람이 바로 읽을 수 있는 텍스트로 변환해.
4. 불필요한 말(인사, 설명)은 생략하고 데이터만 줘.`;

  // gemini-3-flash-preview: 비전 최강(MMMU-Pro 81.2%), 답추출기보다 인식률 ↑
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType } },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Vision API 실패: ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason: string = data.candidates?.[0]?.finishReason || 'unknown';
  const usage = data.usageMetadata || {};
  console.log(`[match-answers]   [answer] finishReason=${finishReason}, tokens: in=${usage.promptTokenCount} out=${usage.candidatesTokenCount} thinking=${usage.thoughtsTokenCount ?? 0}`);
  if (!rawText) throw new Error('Gemini Vision 응답이 비어있습니다');

  // 멀티라인 답 병합: "17. (1)12\n(2)-2/3\n(3)-4" → "17. (1)12 (2)-2/3 (3)-4"
  const mergedLines: string[] = [];
  for (const raw of rawText.split('\n').map((l: string) => l.trim())) {
    if (!raw) continue;
    if (/^\d{1,2}\s*[.)]/.test(raw)) mergedLines.push(raw);
    else if (mergedLines.length > 0) mergedLines[mergedLines.length - 1] += ' ' + raw;
  }

  // "N. 답" 형식 파싱 (원문자 → 숫자로 변환해 매칭에 사용)
  const answers: ParsedAnswer[] = [];
  for (const line of mergedLines) {
    const m = line.match(/^(\d{1,2})\s*[.)]\s*(.+)$/);
    if (!m) continue;
    const num = parseInt(m[1]);
    let ans = m[2].trim();
    if (num < 1 || num > 50 || !ans) continue;

    // 단독 원문자 → 숫자 변환
    let answerType: ParsedAnswer['answerType'] = 'text';
    if (/^[①②③④⑤]\s*$/.test(ans)) {
      ans = CIRCLED_TO_DIGIT[ans.trim()] || ans;
      answerType = 'choice';
    } else if (/^[1-5]$/.test(ans)) {
      answerType = 'choice';
    } else if (/^-?\d+(?:[.,]\d+)?$/.test(ans)) {
      answerType = 'numeric';
    }

    answers.push({ problemNumber: num, answer: ans, answerType });
  }

  return answers;
}

// ============================================================================
// Gemini Vision — 해설지에서 문제별 답+해설 동시 추출
// Mathpix 타임아웃 회피용, 구조화된 출력 후 파싱
// ============================================================================

async function extractSolutionsWithGemini(
  file: File
): Promise<{ answers: ParsedAnswer[]; solutions: { problemNumber: number; solutionLatex: string }[] }> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');

  const prompt = `이 파일은 수학 시험의 해설지야. 각 문제의 답과 해설을 추출해서 아래 형식으로 출력해.

[출력 형식]
--- 문제 1 ---
답: ③
해설: (해설 원문을 그대로 옮겨. 수식은 LaTeX 문법 $...$ 또는 $$...$$ 사용)

--- 문제 2 ---
답: -17
해설: ...

(빈 줄로 구분)

[중요 원칙]
1. 문서에 있는 해설을 요약하거나 재구성하지 말고 **원문 그대로** 옮겨.
2. 객관식 답은 원문자(①②③④⑤) 그대로 유지. (1), 1 로 변환 금지.
3. 수식은 LaTeX 보존 (분수, 극한, 적분, 제곱근 등).
4. 문제 번호는 1~50 범위. 범위 밖은 제외.
5. 해설이 없는 문제는 "해설: 없음"으로 표기.
6. 불필요한 인사나 설명 생략, 위 형식만 출력.
7. 모든 문제를 **빠짐없이** 추출. 중간에 멈추지 말 것.`;

  const model = process.env.GEMINI_VISION_MODEL || 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType } },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Vision API 실패: ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason: string = data.candidates?.[0]?.finishReason || 'unknown';
  const usage = data.usageMetadata || {};
  console.log(`[match-answers]   [solution ${file.name}] finishReason=${finishReason}, tokens: in=${usage.promptTokenCount} out=${usage.candidatesTokenCount} thinking=${usage.thoughtsTokenCount ?? 0}`);
  if (finishReason === 'MAX_TOKENS') {
    console.warn(`[match-answers]   [solution ${file.name}] ⚠️ maxOutputTokens 도달, 마지막 해설 미완성 가능`);
  }
  if (!rawText) throw new Error('Gemini Vision 응답이 비어있습니다');

  // "--- 문제 N ---" 블록 단위로 쪼개서 파싱
  const answers: ParsedAnswer[] = [];
  const solutions: { problemNumber: number; solutionLatex: string }[] = [];

  // 블록 분리: "--- 문제 N ---" 패턴 기준
  const blocks = rawText.split(/^---\s*문제\s*(\d{1,2})\s*---\s*$/m);
  // split 결과: [before, num1, body1, num2, body2, ...]
  for (let i = 1; i < blocks.length; i += 2) {
    const num = parseInt(blocks[i]);
    const body = blocks[i + 1] || '';
    if (!num || num < 1 || num > 50) continue;

    // 답 추출
    const ansMatch = body.match(/답\s*[:：]\s*([^\n]+)/);
    if (ansMatch) {
      let ans = ansMatch[1].trim();
      let answerType: ParsedAnswer['answerType'] = 'text';
      if (/^[①②③④⑤]\s*$/.test(ans)) {
        ans = CIRCLED_TO_DIGIT[ans.trim()] || ans;
        answerType = 'choice';
      } else if (/^[1-5]$/.test(ans)) {
        answerType = 'choice';
      } else if (/^-?\d+(?:[.,]\d+)?$/.test(ans)) {
        answerType = 'numeric';
      }
      if (ans) answers.push({ problemNumber: num, answer: ans, answerType });
    }

    // 해설 추출 (답 라인 다음부터 블록 끝까지)
    const solMatch = body.match(/해설\s*[:：]\s*([\s\S]+?)(?=\n---|\s*$)/);
    if (solMatch) {
      const sol = solMatch[1].trim();
      if (sol && sol !== '없음') {
        solutions.push({ problemNumber: num, solutionLatex: sol });
      }
    }
  }

  return { answers, solutions };
}

// ============================================================================
// Mathpix OCR — PDF 전용
// ============================================================================

async function ocrPdf(file: File): Promise<string> {
  if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) {
    throw new Error('Mathpix API 키가 설정되지 않았습니다.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'application/pdf' }), file.name);
  formData.append('options_json', JSON.stringify({
    conversion_formats: { text: true },
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
  }));

  const res = await fetch('https://api.mathpix.com/v3/pdf', {
    method: 'POST',
    headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    body: formData as any,
  });

  if (!res.ok) throw new Error(`Mathpix PDF API 실패: ${res.status}`);
  const data = await res.json();
  const pdfId = data.pdf_id;
  if (!pdfId) {
    // pdf_id 없으면 POST 바디에 에러 메시지가 들어있는 경우가 많음
    throw new Error(`Mathpix POST 응답에 pdf_id 없음: ${JSON.stringify(data).slice(0, 200)}`);
  }
  console.log(`[ocrPdf] ${file.name}: pdf_id=${pdfId} — 폴링 시작`);

  let lastStatus = '';
  for (let i = 0; i < 55; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
      headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    });
    const statusData = await statusRes.json();
    if (statusData.status !== lastStatus) {
      console.log(`[ocrPdf] ${file.name}: status=${statusData.status} (i=${i}, ${JSON.stringify(statusData).slice(0, 200)})`);
      lastStatus = statusData.status;
    }
    if (statusData.status === 'completed') {
      const textRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.mmd`, {
        headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
      });
      return await textRes.text();
    }
    if (statusData.status === 'error') {
      throw new Error(`Mathpix PDF 처리 실패: ${statusData.error_info?.message || 'unknown'}`);
    }
  }
  throw new Error(`Mathpix PDF 처리 타임아웃 (마지막 상태: ${lastStatus})`);
}

// ============================================================================
// Mathpix OCR — 이미지 전용 (해설 이미지가 여러 장으로 들어올 때)
// /v3/text는 동기 호출이라 polling 불필요
// ============================================================================

async function ocrImage(file: File): Promise<string> {
  if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) {
    throw new Error('Mathpix API 키가 설정되지 않았습니다.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'image/jpeg';
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), file.name);
  formData.append('options_json', JSON.stringify({
    formats: ['text'],
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
  }));

  const res = await fetch('https://api.mathpix.com/v3/text', {
    method: 'POST',
    headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    body: formData as any,
  });

  if (!res.ok) throw new Error(`Mathpix 이미지 OCR 실패: ${res.status}`);
  const data = await res.json();
  return (data.text as string) || '';
}
