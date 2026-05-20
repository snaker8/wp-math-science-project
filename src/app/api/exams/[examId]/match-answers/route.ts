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
    let skippedNoChange = 0;
    let skippedProblemMissing = 0;
    const failedUpdates: Array<{ problemId: string; reason: string }> = [];
    // ★ 객관식 모호값 → 빈값 강등 케이스 추적 (2026-05-18)
    //   "5개 적용, 3개는 빈값 강등 → 수동 입력 필요" 같은 정확한 보고 위해
    const coercedToEmpty: Array<{ problemId: string; rawAnswer: string }> = [];

    console.log(`[match-answers PUT] examId=${examId}, totalMatches=${matches.length}`,
      matches.slice(0, 5).map(m => ({
        pid: m.problemId,
        newAns: m.newAnswer,
        hasSol: !!m.newSolution,
      })),
    );

    for (const match of matches) {
      if (!match.newAnswer && !match.newSolution) {
        skippedNoChange++;
        continue;
      }

      // 기존 데이터 조회
      const { data: problem } = await supabaseAdmin
        .from('problems')
        .select('answer_json, solution_latex')
        .eq('id', match.problemId)
        .single();

      if (!problem) {
        skippedProblemMissing++;
        failedUpdates.push({ problemId: match.problemId, reason: 'problem not found' });
        continue;
      }

      const updates: Record<string, unknown> = {};

      // 빠른답 업데이트 — 수동 업로드이므로 보호 플래그 설정
      const answerJson = (problem.answer_json || {}) as Record<string, unknown>;
      const mergedAj: Record<string, unknown> = { ...answerJson };

      if (match.newAnswer) {
        // ★ 객관식 박힘 차단 — 0/모호값은 빈값으로 normalize.
        //   메모리: feedback_objective_answer_safety.md
        //
        // ★★ 단일 판정 기준 (2026-05-18) — "객관식 vs 단답" 가 코드 분기마다 다르게
        //   판정되던 "왔다갔다" 우려 해소. 진실의 원천은 `answer_json.type` 하나만:
        //     - type==='multiple_choice' → 객관식 (normalize 강제)
        //     - 그 외(short_answer, narrative, null 등) → 단답·서술 (원본 보존)
        //
        //   이전 가드는 두 갈래 (type-기반 + choices-기반) 라 동일 문제가 분기마다
        //   다른 결과. CHECK constraint chk_objective_answer_valid 도 type 기준이라
        //   일관성 확보 — 단답으로 처리된 row 는 CHECK 미적용, 객관식은 normalize 통과.
        const { normalizeObjectiveAnswer } = await import('@/lib/validation/objective-answer');
        const trimmedAns = match.newAnswer.trim();
        const isMultipleChoice = mergedAj.type === 'multiple_choice';
        const safeAns = isMultipleChoice
          ? normalizeObjectiveAnswer(match.newAnswer)  // CHECK 통과 보장
          : match.newAnswer;                            // 단답·서술 원본 보존
        // ★ 빈값 강등된 경우 추적 — alert 에서 사용자에게 보고
        if (isMultipleChoice && trimmedAns !== '' && safeAns === '') {
          console.log(`[match-answers PUT] 객관식 모호값 → 빈값 강등: id=${match.problemId}, raw="${trimmedAns}"`);
          coercedToEmpty.push({ problemId: match.problemId, rawAnswer: trimmedAns });
        }
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

        if (!error) {
          updatedCount++;
        } else {
          console.error(`[match-answers PUT] 문제 ${match.problemId} 업데이트 실패:`, error.message, {
            newAnswer: match.newAnswer,
            hasSolution: !!match.newSolution,
            finalAnswerToSet: mergedAj.finalAnswer,
          });
          failedUpdates.push({ problemId: match.problemId, reason: error.message });
        }
      }
    }

    console.log(`[match-answers PUT] 완료 — updated=${updatedCount}, failed=${failedUpdates.length}, skippedNoChange=${skippedNoChange}, skippedMissing=${skippedProblemMissing}, coercedToEmpty=${coercedToEmpty.length}, totalMatches=${matches.length}`);

    return NextResponse.json({
      examId,
      updatedCount,
      totalMatches: matches.length,
      // ★ 사용자가 alert 에서 실제 적용 누락 사례 확인 가능하도록 노출
      skippedNoChange,
      skippedProblemMissing,
      failedUpdates,
      coercedToEmpty, // 객관식 모호값 → 빈값 강등 사례
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

// ============================================================================
// PDF 페이지 분할 — 페이지/컬럼 경계 사고 차단 (2026-05-18)
//   배경: 사용자 보고 — 해설지에서 "12번 문제 좌측 끝 → 12번 답 우측 상단 시작" 또는
//         "1쪽 끝 → 2쪽 시작" 같은 경계에서 Gemini 가 문제와 답 연결 실패.
//   전략: multi-page PDF 를 1쪽 단위로 분할 → 페이지마다 Gemini 호출 → 결과 누적.
//         페이지 안 좌→우 컬럼 순서는 Gemini 가 잘 처리. 페이지 경계만 해소.
//   회귀: 단일 페이지 PDF / 이미지는 분할 안 함 (기존 흐름 유지).
// ============================================================================
async function splitPdfToPages(file: File): Promise<File[]> {
  const { PDFDocument } = await import('pdf-lib');
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();
  if (pageCount <= 1) return [file]; // 단일 페이지 — 분할 X

  const pages: File[] = [];
  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copied] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copied);
    const bytes = await newPdf.save();
    // bytes 는 Uint8Array — Buffer 로 감싸서 명시적 ArrayBuffer 전달
    pages.push(new File([Buffer.from(bytes)], `${file.name.replace(/\.pdf$/i, '')}_p${i + 1}.pdf`, { type: 'application/pdf' }));
  }
  console.log(`[match-answers] PDF 페이지 분할: ${file.name} → ${pageCount} 쪽`);
  return pages;
}

// ★ 페이지 분할 래퍼: multi-page PDF 면 페이지별 분리 호출 + 결과 누적 (2026-05-18)
async function extractAnswersWithGemini(file: File): Promise<ParsedAnswer[]> {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) return extractAnswersWithGeminiSingle(file);
  const pages = await splitPdfToPages(file);
  if (pages.length === 1) return extractAnswersWithGeminiSingle(pages[0]);
  const all: ParsedAnswer[] = [];
  const seen = new Set<number>();
  for (const page of pages) {
    try {
      const ans = await extractAnswersWithGeminiSingle(page);
      for (const a of ans) {
        if (!seen.has(a.problemNumber)) {
          all.push(a);
          seen.add(a.problemNumber);
        }
      }
    } catch (err) {
      console.error(`[match-answers] 답 추출 페이지 실패 ${page.name}: ${err instanceof Error ? err.message : err}`);
      // 한 페이지 실패해도 나머지 페이지는 계속
    }
  }
  return all.sort((a, b) => a.problemNumber - b.problemNumber);
}

async function extractAnswersWithGeminiSingle(file: File): Promise<ParsedAnswer[]> {
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

// ★ 페이지 분할 래퍼 (해설용): multi-page PDF 면 페이지별 분리 호출 + 결과 누적 (2026-05-18)
//   ★ 누락 복구 (2026-05-19): 페이지별 처리 후 누락 번호 발견 시 통짜 PDF 로 한 번 더
//   호출. Gemini 가 페이지 단독으로는 형식 변형해도 전체로 보면 정상 처리하는 케이스 보강.
async function extractSolutionsWithGemini(
  file: File
): Promise<{ answers: ParsedAnswer[]; solutions: { problemNumber: number; solutionLatex: string }[] }> {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) return extractSolutionsWithGeminiSingle(file);
  const pages = await splitPdfToPages(file);
  if (pages.length === 1) return extractSolutionsWithGeminiSingle(pages[0]);
  const allAnswers: ParsedAnswer[] = [];
  const allSolutions: { problemNumber: number; solutionLatex: string }[] = [];
  const seenAns = new Set<number>();
  for (const page of pages) {
    try {
      const { answers, solutions } = await extractSolutionsWithGeminiSingle(page);
      for (const a of answers) {
        if (!seenAns.has(a.problemNumber)) {
          allAnswers.push(a);
          seenAns.add(a.problemNumber);
        }
      }
      // 해설은 같은 번호여도 페이지 경계로 잘릴 수 있어 이어붙임
      for (const s of solutions) {
        const existing = allSolutions.find(x => x.problemNumber === s.problemNumber);
        if (existing) {
          existing.solutionLatex = existing.solutionLatex + '\n' + s.solutionLatex;
        } else {
          allSolutions.push(s);
        }
      }
    } catch (err) {
      console.error(`[match-answers] 해설 추출 페이지 실패 ${page.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ★ 통짜 PDF 폴백 (2026-05-19) — 페이지별 결과의 sparse gap 보강.
  //   기준: 최대 번호 기준 expected 1..max 중 누락 비율이 ≥ 10% 면 통짜로 한 번 더 호출.
  //   누락된 번호만 합쳐서 사용 — 기존 답·해설은 덮어쓰지 않음 (페이지 결과 우선).
  if (allAnswers.length > 0 || allSolutions.length > 0) {
    const maxNum = Math.max(
      ...allAnswers.map(a => a.problemNumber),
      ...allSolutions.map(s => s.problemNumber),
      0,
    );
    const seenSol = new Set(allSolutions.map(s => s.problemNumber));
    const missingAns: number[] = [];
    const missingSol: number[] = [];
    for (let n = 1; n <= maxNum; n++) {
      if (!seenAns.has(n)) missingAns.push(n);
      if (!seenSol.has(n)) missingSol.push(n);
    }
    const missingRatio = Math.max(missingAns.length, missingSol.length) / Math.max(maxNum, 1);
    if (missingRatio >= 0.10 && (missingAns.length > 0 || missingSol.length > 0)) {
      console.log(`[match-answers] 누락 복구 폴백 진입 (${file.name}): 답 누락=${missingAns.join(',')}, 해설 누락=${missingSol.join(',')} → 통짜 PDF 재호출`);
      try {
        const full = await extractSolutionsWithGeminiSingle(file);
        let recoveredA = 0;
        let recoveredS = 0;
        for (const a of full.answers) {
          if (!seenAns.has(a.problemNumber)) {
            allAnswers.push(a);
            seenAns.add(a.problemNumber);
            recoveredA++;
          }
        }
        for (const s of full.solutions) {
          if (!seenSol.has(s.problemNumber)) {
            allSolutions.push(s);
            seenSol.add(s.problemNumber);
            recoveredS++;
          }
        }
        console.log(`[match-answers]   복구 결과: 답 +${recoveredA}, 해설 +${recoveredS}`);
      } catch (err) {
        console.warn(`[match-answers] 통짜 PDF 복구 실패 (${file.name}): ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  return {
    answers: allAnswers.sort((a, b) => a.problemNumber - b.problemNumber),
    solutions: allSolutions.sort((a, b) => a.problemNumber - b.problemNumber),
  };
}

async function extractSolutionsWithGeminiSingle(
  file: File
): Promise<{ answers: ParsedAnswer[]; solutions: { problemNumber: number; solutionLatex: string }[] }> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');

  const prompt = `이 파일은 수학·과학 시험의 해설지야. 각 문제의 답과 해설을 추출해서 아래 형식으로 출력해.

[출력 형식 — 반드시 이 헤더 형식만 사용. 다른 헤더(##, **, [N] 등) 금지]
--- 문제 1 ---
답: ③
해설: (해설 원문을 그대로 옮겨. 수식은 LaTeX 문법 $...$ 또는 $$...$$ 사용)

--- 문제 2 ---
답: -17
해설: ...

(블록은 빈 줄로 구분)

[중요 원칙]
1. 문서에 있는 해설을 요약하거나 재구성하지 말고 **원문 그대로** 옮겨.
2. 객관식 답은 원문자(①②③④⑤) 그대로 유지. (1), 1 로 변환 금지.
3. 수식은 LaTeX 보존 (분수, 극한, 적분, 제곱근 등).
4. 문제 번호는 1~50 범위. 범위 밖은 제외.
5. 해설이 없는 문제는 "해설: 없음"으로 표기. **답은 항상 추출** — 모르면 "답: 알 수 없음".
6. 불필요한 인사나 설명 생략, 위 형식만 출력.
7. 모든 문제를 **빠짐없이** 추출. 중간에 멈추지 말 것. 문제 번호 누락 절대 금지.
8. 페이지 안에 보이는 모든 문제 번호를 빠짐없이 "--- 문제 N ---" 헤더로 시작해. 헤더 빼먹지 마.`;

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

  // ★ 다양한 블록 델리미터 지원 (2026-05-19): Gemini 가 가끔 prompt 무시하고
  //   "## 문제 15", "### 15번", "**문제 15**", "[15]" 같은 형식 섞어서 출력 →
  //   기존엔 strict "--- 문제 N ---" 만 인식해서 그 문제 통째로 누락.
  //   사용자 보고: 40문제 중 #15·#8 등이 새 답·해설 빈값으로 표시됨.
  //
  //   1) 다양한 헤더 패턴 매칭 (정규식 union)
  //   2) 매칭된 위치들 사이 텍스트를 body 로 슬라이싱
  //   3) 마지막 매칭 이후 끝까지도 body 로 포함
  const answers: ParsedAnswer[] = [];
  const solutions: { problemNumber: number; solutionLatex: string }[] = [];

  // 블록 헤더 후보 패턴들 (대소문자·공백·기호 변형 허용).
  // capture group 1 = 문제 번호. 줄 시작·줄 끝 앵커 ^...$ + multiline.
  const HEADER_PATTERNS: RegExp[] = [
    /^[-=]{2,}\s*문제\s*(\d{1,2})\s*[-=]{2,}\s*$/gm,         // --- 문제 N ---
    /^#{1,6}\s*문제\s*(\d{1,2})\s*\.?\s*$/gm,                  // ## 문제 N
    /^#{1,6}\s*(\d{1,2})\s*번\s*\.?\s*$/gm,                    // ### N번
    /^\*{1,2}\s*문제\s*(\d{1,2})\s*\*{1,2}\s*$/gm,            // **문제 N**
    /^\[\s*(\d{1,2})\s*\]\s*$/gm,                              // [N]
    /^문제\s*(\d{1,2})\s*[.):]?\s*$/gm,                        // 문제 N (단독 라인)
    /^(\d{1,2})\s*번\s*\.?\s*$/gm,                             // N번 (단독 라인)
  ];

  // 모든 헤더 매칭 수집: { index, length, num }
  type Hit = { index: number; length: number; num: number };
  const hits: Hit[] = [];
  const seenIdx = new Set<number>();
  for (const re of HEADER_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(rawText)) !== null) {
      // 같은 위치 중복 방지 (다른 패턴이 겹쳐 매칭한 경우)
      if (seenIdx.has(m.index)) continue;
      const num = parseInt(m[1], 10);
      if (!num || num < 1 || num > 50) continue;
      hits.push({ index: m.index, length: m[0].length, num });
      seenIdx.add(m.index);
    }
  }
  // 등장 순서 (파일 내 위치) 로 정렬
  hits.sort((a, b) => a.index - b.index);

  // 같은 번호가 여러 번 등장하면 첫 번째 만 사용 (중복 헤더 fallback)
  const seenNum = new Set<number>();
  const dedupHits: Hit[] = [];
  for (const h of hits) {
    if (seenNum.has(h.num)) continue;
    seenNum.add(h.num);
    dedupHits.push(h);
  }

  // 각 hit 의 body = 자기 헤더 끝 ~ 다음 hit 시작 (마지막은 ~ rawText 끝)
  for (let i = 0; i < dedupHits.length; i++) {
    const h = dedupHits[i];
    const bodyStart = h.index + h.length;
    const bodyEnd = i + 1 < dedupHits.length ? dedupHits[i + 1].index : rawText.length;
    const body = rawText.slice(bodyStart, bodyEnd);
    parseBlockBody(body, h.num, answers, solutions);
  }

  // ★ Fallback (2026-05-19): 블록 헤더 매칭 0개거나 매우 적으면 line-based 파싱 시도.
  //   Gemini 가 헤더 없이 "15. 답: 4\n해설: ..." 같은 flat 출력하는 경우.
  if (dedupHits.length === 0) {
    parseFlatFallback(rawText, answers, solutions);
  }

  return { answers, solutions };
}

// 블록 body 에서 답·해설 추출 (in-place push)
function parseBlockBody(
  body: string,
  num: number,
  answers: ParsedAnswer[],
  solutions: { problemNumber: number; solutionLatex: string }[],
) {
  // 답 추출 — "답:" 다음 줄에 답이 와도 OK (한 줄 또는 다음 줄)
  const ansMatch = body.match(/답\s*[:：]\s*([^\n]*)/);
  if (ansMatch) {
    let ans = ansMatch[1].trim();
    // 같은 줄이 비어있으면 다음 줄에서 첫 비어있지 않은 라인 시도
    if (!ans) {
      const after = body.slice(body.indexOf(ansMatch[0]) + ansMatch[0].length).split('\n');
      for (const ln of after) {
        const t = ln.trim();
        if (t && !/^(해설|풀이)/.test(t)) { ans = t; break; }
        if (t && /^(해설|풀이)/.test(t)) break;
      }
    }
    let answerType: ParsedAnswer['answerType'] = 'text';
    if (/^[①②③④⑤]\s*$/.test(ans)) {
      ans = CIRCLED_TO_DIGIT[ans.trim()] || ans;
      answerType = 'choice';
    } else if (/^[1-5]$/.test(ans)) {
      answerType = 'choice';
    } else if (/^-?\d+(?:[.,]\d+)?$/.test(ans)) {
      answerType = 'numeric';
    }
    if (ans && ans !== '없음' && !/^알\s*수\s*없/.test(ans)) {
      answers.push({ problemNumber: num, answer: ans, answerType });
    }
  }

  // 해설 추출 — "해설:" 또는 "풀이:" 다음부터 블록 끝까지
  const solMatch = body.match(/(?:해설|풀이)\s*[:：]\s*([\s\S]+?)$/);
  if (solMatch) {
    const sol = solMatch[1].trim();
    if (sol && sol !== '없음' && !/^알\s*수\s*없/.test(sol)) {
      solutions.push({ problemNumber: num, solutionLatex: sol });
    }
  }
}

// Flat 출력 폴백: 헤더 없이 "15. 답: 4\n해설: ..." 같은 형식
function parseFlatFallback(
  text: string,
  answers: ParsedAnswer[],
  solutions: { problemNumber: number; solutionLatex: string }[],
) {
  // "N. 답: X" 줄 단위 스캔
  const lines = text.split('\n');
  let currentNum: number | null = null;
  let currentSolBuf: string[] = [];
  const flushSol = () => {
    if (currentNum !== null && currentSolBuf.length > 0) {
      const sol = currentSolBuf.join('\n').trim();
      if (sol && sol !== '없음') {
        solutions.push({ problemNumber: currentNum, solutionLatex: sol });
      }
    }
    currentSolBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    // "N. 답: X" 패턴
    const m = line.match(/^(\d{1,2})\s*[.)]\s*답\s*[:：]\s*(.+)$/);
    if (m) {
      flushSol();
      const num = parseInt(m[1], 10);
      const ans = m[2].trim();
      if (num >= 1 && num <= 50 && ans) {
        let answerType: ParsedAnswer['answerType'] = 'text';
        let normalized = ans;
        if (/^[①②③④⑤]$/.test(ans)) {
          normalized = CIRCLED_TO_DIGIT[ans] || ans;
          answerType = 'choice';
        } else if (/^[1-5]$/.test(ans)) {
          answerType = 'choice';
        } else if (/^-?\d+(?:[.,]\d+)?$/.test(ans)) {
          answerType = 'numeric';
        }
        if (normalized !== '없음') {
          answers.push({ problemNumber: num, answer: normalized, answerType });
        }
        currentNum = num;
      }
      continue;
    }
    // "해설:" 시작 → 이후 블록을 currentSolBuf 에 누적
    const solStart = line.match(/^(?:해설|풀이)\s*[:：]\s*(.*)$/);
    if (solStart && currentNum !== null) {
      flushSol();
      const rest = solStart[1].trim();
      if (rest) currentSolBuf.push(rest);
      continue;
    }
    // 진행 중인 해설에 라인 추가
    if (currentNum !== null && currentSolBuf.length > 0) {
      currentSolBuf.push(raw);
    }
  }
  flushSol();
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
