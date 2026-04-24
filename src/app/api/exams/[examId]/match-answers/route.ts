// ============================================================================
// POST /api/exams/[examId]/match-answers — 빠른답/해설 파일 업로드 → OCR → 매칭 미리보기
// PUT  /api/exams/[examId]/match-answers — 확인된 매칭 적용 → DB 업데이트
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseAnswerDocument, type ParsedAnswer } from '@/lib/ocr/answer-parser';

const MATHPIX_APP_ID = process.env.MATHPIX_APP_ID || '';
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY || '';
const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

export const maxDuration = 120;

// ============================================================================
// POST: 파일 업로드 → OCR → 파싱 → 매칭 미리보기
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
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

    // 2. OCR / Vision 추출
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    console.log(`[match-answers] 추출 시작: ${file.name} (${file.size} bytes, isPdf=${isPdf})`);

    let parseResult;
    if (!isPdf) {
      // 이미지 → Gemini 2.5 Flash Vision (Mathpix보다 빠른답 이미지를 훨씬 잘 읽음)
      const visionAnswers = await extractAnswersWithGemini(file);
      if (visionAnswers.length === 0) {
        return NextResponse.json({ error: '이미지에서 답을 찾지 못했습니다. 빠른답 이미지인지 확인해주세요.' }, { status: 400 });
      }
      console.log(`[match-answers] Gemini Vision 추출 완료: ${visionAnswers.length}개 답`);
      parseResult = {
        answers: visionAnswers,
        solutions: [],
        rawText: visionAnswers.map(a => `${a.problemNumber}. ${a.answer}`).join('\n'),
        detectedType: 'quick_answer' as const,
      };
    } else {
      // PDF → Mathpix OCR → 파서
      const ocrText = await ocrPdf(file);
      if (!ocrText || ocrText.trim().length < 10) {
        return NextResponse.json({ error: 'OCR 결과가 비어있습니다.' }, { status: 400 });
      }
      console.log(`[match-answers] Mathpix OCR 완료: ${ocrText.length}자`);
      parseResult = parseAnswerDocument(ocrText);
    }
    console.log(`[match-answers] 파싱 결과: type=${parseResult.detectedType}, answers=${parseResult.answers.length}, solutions=${parseResult.solutions.length}`);

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
        currentSolution: currentSolution.slice(0, 100),
        newSolution: newSolution.slice(0, 100),
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
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

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
        mergedAj.finalAnswer = match.newAnswer;
        mergedAj.correct_answer = match.newAnswer;
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
  const mimeType = file.type || 'image/jpeg';

  const prompt = `이 이미지에서 정답표(정답지)를 찾아서 텍스트로 추출해줘. 문제 번호와 정답을 각 줄에 하나씩 나열해. 형식은 '문제번호. 정답' (예: 1. ①, 2. 5, 3. -1, 4. 1/2, 5. 해설참조) 형태로 해줘.

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

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
      headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    });
    const statusData = await statusRes.json();
    if (statusData.status === 'completed') {
      const textRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.mmd`, {
        headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
      });
      return await textRes.text();
    }
    if (statusData.status === 'error') throw new Error('Mathpix PDF 처리 실패');
  }
  throw new Error('Mathpix PDF 처리 타임아웃');
}
