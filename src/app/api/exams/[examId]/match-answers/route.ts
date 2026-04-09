// ============================================================================
// POST /api/exams/[examId]/match-answers — 빠른답/해설 파일 업로드 → OCR → 매칭 미리보기
// PUT  /api/exams/[examId]/match-answers — 확인된 매칭 적용 → DB 업데이트
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseAnswerDocument } from '@/lib/ocr/answer-parser';

const MATHPIX_APP_ID = process.env.MATHPIX_APP_ID || '';
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY || '';

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

    // 2. Mathpix OCR
    console.log(`[match-answers] OCR 시작: ${file.name} (${file.size} bytes)`);
    const ocrText = await ocrFile(file);

    if (!ocrText || ocrText.trim().length < 10) {
      return NextResponse.json({ error: 'OCR 결과가 비어있습니다.' }, { status: 400 });
    }

    console.log(`[match-answers] OCR 완료: ${ocrText.length}자`);

    // 3. 파싱
    const parseResult = parseAnswerDocument(ocrText);
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
      const hasChange = (newAnswer && newAnswer !== currentAnswer) || (newSolution && newSolution !== currentSolution);

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
      rawTextPreview: ocrText.slice(0, 500),
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

      // 빠른답 업데이트
      if (match.newAnswer) {
        const answerJson = (problem.answer_json || {}) as Record<string, unknown>;
        updates.answer_json = {
          ...answerJson,
          finalAnswer: match.newAnswer,
          correct_answer: match.newAnswer,
        };
      }

      // 해설 업데이트
      if (match.newSolution) {
        updates.solution_latex = match.newSolution;
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
// Mathpix OCR (PDF/이미지 → 텍스트)
// ============================================================================

async function ocrFile(file: File): Promise<string> {
  if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) {
    throw new Error('Mathpix API 키가 설정되지 않았습니다.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

  if (isPdf) {
    // PDF → Mathpix PDF API
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'application/pdf' }), file.name);
    formData.append('options_json', JSON.stringify({
      conversion_formats: { text: true },
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$'],
    }));

    const res = await fetch('https://api.mathpix.com/v3/pdf', {
      method: 'POST',
      headers: {
        'app_id': MATHPIX_APP_ID,
        'app_key': MATHPIX_APP_KEY,
      },
      body: formData as any,
    });

    if (!res.ok) throw new Error(`Mathpix PDF API 실패: ${res.status}`);
    const data = await res.json();
    const pdfId = data.pdf_id;

    // PDF 처리 완료 대기 (최대 60초)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
        headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
      });
      const statusData = await statusRes.json();
      if (statusData.status === 'completed') {
        // 텍스트 결과 가져오기
        const textRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.mmd`, {
          headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
        });
        return await textRes.text();
      }
      if (statusData.status === 'error') throw new Error('Mathpix PDF 처리 실패');
    }
    throw new Error('Mathpix PDF 처리 타임아웃');

  } else {
    // 이미지 → Mathpix Image API
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/png';

    const res = await fetch('https://api.mathpix.com/v3/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app_id': MATHPIX_APP_ID,
        'app_key': MATHPIX_APP_KEY,
      },
      body: JSON.stringify({
        src: `data:${mimeType};base64,${base64}`,
        formats: ['text'],
        math_inline_delimiters: ['$', '$'],
        math_display_delimiters: ['$$', '$$'],
      }),
    });

    if (!res.ok) throw new Error(`Mathpix Image API 실패: ${res.status}`);
    const data = await res.json();
    return data.text || '';
  }
}
