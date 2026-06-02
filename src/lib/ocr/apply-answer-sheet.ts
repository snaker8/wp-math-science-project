// ============================================================================
// 빠른답/정답해설 파일 → 추출 → 문제 seq 매칭 → answer_json + solution_latex 적용 (공용)
//
// 클라우드 match-answers 와 동일하게 lib 함수만 재사용(추출 로직 재구현 X):
//   - 빠른답(kind='quick') → extractAnswersWithGemini (answer-vision, 답만)
//   - 정답해설(kind='solution') → Mathpix OCR(mathpix) → parseAnswerDocument(answer-parser, 답+해설)
//   - 적용 = match-answers PUT 과 동일 안전 로직:
//       · 객관식 ①~⑤ 만 신뢰(normalizeObjectiveAnswer), ①~⑤ 아닌 단답형은 type→short_answer 보정
//       · 빈값/강등은 미적용(기존 보존). 해설→답 폴백(extractFinalAnswerFromSolution)
//       · answer_user_edited / solution_user_edited 플래그(일괄 재생성 보호)
//   자산화 첫 모달(workflow/upload)에서 답안 파일 같이 올리면 자산화 직후 자동 호출.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractAnswersWithGemini } from './answer-vision';
import { parseAnswerDocument, extractFinalAnswerFromSolution } from './answer-parser';
import { getMathpixClient } from './mathpix';
import { normalizeObjectiveAnswer, isValidObjectiveAnswer } from '@/lib/validation/objective-answer';

export interface AnswerSheetFile {
  file: File;
  kind: 'quick' | 'solution'; // 빠른답 / 정답해설
}

export interface ApplyAnswerResult {
  parsedAnswers: number;
  parsedSolutions: number;
  answersApplied: number;
  solutionsApplied: number;
  coercedToEmpty: number;
}

async function ocrToText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const client = getMathpixClient();
  if (isPdf) {
    const pages = await client.processPDF(buf);
    return pages.map((p) => p.text || '').filter(Boolean).join('\n\n');
  }
  const resp = await client.processImage(buf);
  return resp.text || '';
}

/**
 * 정답표/해설 파일들에서 답·해설을 추출해 시험지 문제(sequence_number 매칭)에 적용.
 * 변화 없거나 빈값/강등은 적용 안 함(자동 적용이라 보수적 — 기존 보존, 절대 삭제 X).
 */
export async function applyAnswerSheet(
  admin: SupabaseClient,
  examId: string,
  sheets: AnswerSheetFile[],
): Promise<ApplyAnswerResult> {
  const answerMap = new Map<number, string>();   // problemNumber → answer
  const solutionMap = new Map<number, string>(); // problemNumber → solutionLatex

  for (const { file, kind } of sheets) {
    try {
      if (kind === 'quick') {
        const answers = await extractAnswersWithGemini(file);
        for (const a of answers) {
          if (a.answer && !answerMap.has(a.problemNumber)) answerMap.set(a.problemNumber, a.answer);
        }
      } else {
        // 정답해설 — Mathpix OCR → parseAnswerDocument (답 + 해설 동시)
        const text = await ocrToText(file);
        if (text && text.trim().length >= 10) {
          const parsed = parseAnswerDocument(text);
          for (const a of parsed.answers) {
            if (a.answer && !answerMap.has(a.problemNumber)) answerMap.set(a.problemNumber, a.answer);
          }
          for (const s of parsed.solutions) {
            if (s.solutionLatex && !solutionMap.has(s.problemNumber)) solutionMap.set(s.problemNumber, s.solutionLatex);
          }
        }
      }
    } catch (e) {
      console.warn(`[applyAnswerSheet] ${kind} 추출 실패 (${file.name}):`, e instanceof Error ? e.message : e);
    }
  }

  if (answerMap.size === 0 && solutionMap.size === 0) {
    return { parsedAnswers: 0, parsedSolutions: 0, answersApplied: 0, solutionsApplied: 0, coercedToEmpty: 0 };
  }

  // exam_problems (seq → problem_id)
  const { data: eps } = await admin
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number');
  const epRows = (eps || []) as Array<{ problem_id: string; sequence_number: number }>;
  if (epRows.length === 0) {
    return { parsedAnswers: answerMap.size, parsedSolutions: solutionMap.size, answersApplied: 0, solutionsApplied: 0, coercedToEmpty: 0 };
  }

  const { data: problems } = await admin
    .from('problems')
    .select('id, answer_json, solution_latex')
    .in('id', epRows.map((e) => e.problem_id));
  const pMap = new Map(
    ((problems || []) as Array<{ id: string; answer_json: Record<string, unknown> | null; solution_latex: string | null }>)
      .map((p) => [p.id, p]),
  );

  let answersApplied = 0;
  let solutionsApplied = 0;
  let coercedToEmpty = 0;
  const nowIso = new Date().toISOString();

  for (const ep of epRows) {
    const p = pMap.get(ep.problem_id);
    if (!p) continue;
    const merged = { ...((p.answer_json || {}) as Record<string, unknown>) };
    const updates: Record<string, unknown> = {};
    let answerChanged = false;
    let solChanged = false;

    // 답 (해설→답 폴백 포함)
    let rawAns = answerMap.get(ep.sequence_number);
    const sol = solutionMap.get(ep.sequence_number);
    if (!rawAns && sol) {
      const ex = extractFinalAnswerFromSolution(sol);
      if (ex) rawAns = ex.answer;
    }
    if (rawAns) {
      const trimmed = rawAns.trim();
      const wasMC = merged.type === 'multiple_choice';
      let safeAns: string;
      if (wasMC && trimmed !== '' && !isValidObjectiveAnswer(trimmed)) {
        merged.type = 'short_answer';
        safeAns = trimmed;
      } else if (wasMC) {
        safeAns = normalizeObjectiveAnswer(rawAns);
        if (trimmed !== '' && safeAns === '') coercedToEmpty++;
      } else {
        safeAns = rawAns;
      }
      const current = String(merged.finalAnswer || merged.correct_answer || '');
      if (safeAns && current !== safeAns) {
        merged.finalAnswer = safeAns;
        merged.correct_answer = safeAns;
        merged.answer_user_edited = true;
        merged.uploaded_at = nowIso;
        answerChanged = true;
      }
    }

    // 해설 (solution_latex)
    if (sol && sol !== (p.solution_latex || '')) {
      updates.solution_latex = sol;
      merged.solution_user_edited = true;
      merged.uploaded_at = nowIso;
      solChanged = true;
    }

    if (answerChanged || solChanged) {
      updates.answer_json = merged;
      const { error } = await admin.from('problems').update(updates).eq('id', ep.problem_id);
      if (!error) {
        if (answerChanged) answersApplied++;
        if (solChanged) solutionsApplied++;
      } else {
        console.warn(`[applyAnswerSheet] 적용 실패 ${ep.problem_id.slice(0, 8)}:`, error.message);
      }
    }
  }

  return {
    parsedAnswers: answerMap.size,
    parsedSolutions: solutionMap.size,
    answersApplied,
    solutionsApplied,
    coercedToEmpty,
  };
}
