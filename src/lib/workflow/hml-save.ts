// ============================================================================
// HML 파싱 결과 → 클라우드 시험지 저장 (OCR/AI 분류 없음, 비용 0)
//   자산화 안전 가드 반영: 같은 제목 중복 차단, institute 격리, created_by 필수.
//   AI 분류는 안 함(typeCode 없음) → 펼쳐보기에서 필요 시 재분류.
//   supabase 클라이언트 주입형 → 라우트(supabaseAdmin)·검증 스크립트 양쪽에서 사용.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeObjectiveAnswer } from '@/lib/validation/objective-answer';
import type { HmlParseResult } from './hml-parser';
import { verifyHmlProblem } from './hml-verify';

export interface HmlSaveContext {
  createdBy: string;                 // 필수 (exams.created_by NOT NULL)
  instituteId: string | null;        // 격리 대상 institute (null=공통풀)
  bookGroupId?: string | null;       // 저장 폴더
  sourceCategory?: 'auto' | 'school' | 'diagnostic' | 'achievement' | 'textbook' | 'mock';
  title: string;                     // 시험지 제목 (보통 파일명)
  sourceName?: string;               // 원본 파일명
}

export interface HmlSaveResult {
  ok: boolean;
  examId?: string;
  savedProblems?: number;
  /** 검증 루프가 ⚠️ 플래그한 문제 수 (검수 필요) */
  flaggedProblems?: number;
  /** 문제 번호 → 검수 사유 (요약 응답용) */
  warningsByNumber?: Record<number, string[]>;
  alreadyExisted?: boolean;
  error?: string;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/** 보기 텍스트 prefix(①, (1), 1. 등) 정규화 → "① 본문" */
function normalizeChoice(c: string, idx: number): string {
  const stripped = c
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
    .replace(/^\(\s*\d+\s*\)\s*/, '')
    .replace(/^\d+\s*[).]\s*/, '')
    .trim();
  return `${CIRCLED[idx] || ''} ${stripped}`.trim();
}

/**
 * 본문에서 배점 추출 + [N점] 텍스트 제거. (자산화 가드 #2 와 동일 우선순위·정규식)
 *   우선순위: [총 N점] > 다수 [Ni점] 합산 > 단일 [N점] > null.
 *   OCR 오타 점/졈/졍 허용. 추출 후 본문 텍스트에서 [총 N점]·[N점] 모두 제거(배지로만 표시).
 */
function extractPoints(content: string): { points: number | null; cleaned: string } {
  const totalRe = /[\[(]\s*총\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]/;
  const singleRe = /[\[(]\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]/g;
  let points: number | null = null;
  const tm = content.match(totalRe);
  if (tm) {
    points = parseFloat(tm[1]);
  } else {
    const all = [...content.matchAll(singleRe)].map((m) => parseFloat(m[1])).filter((n) => Number.isFinite(n));
    if (all.length === 1) points = all[0];
    else if (all.length > 1) points = all.reduce((a, b) => a + b, 0);
  }
  const cleaned = content
    .replace(/[\[(]\s*(?:총\s*)?\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return { points, cleaned };
}

export async function createExamFromHml(
  supabase: SupabaseClient,
  parsed: HmlParseResult,
  ctx: HmlSaveContext,
): Promise<HmlSaveResult> {
  if (!ctx.createdBy) return { ok: false, error: 'createdBy 필수' };
  if (!parsed.problems.length) return { ok: false, error: '추출된 문제가 없습니다' };

  const title = ctx.title.trim();

  // ── 중복 차단 (자산화 가드) — 같은 institute + title (+ book_group) 살아있는 exam 재사용 ──
  try {
    let dup = supabase.from('exams').select('id').eq('title', title).is('deleted_at', null);
    if (ctx.instituteId) dup = dup.eq('institute_id', ctx.instituteId);
    if (ctx.bookGroupId) dup = dup.eq('book_group_id', ctx.bookGroupId);
    const { data: dupRows } = await dup.order('created_at', { ascending: false }).limit(1);
    if (dupRows && dupRows.length > 0) {
      return { ok: true, examId: (dupRows[0] as { id: string }).id, alreadyExisted: true, savedProblems: 0 };
    }
  } catch { /* 조회 실패해도 계속 (새로 생성) */ }

  // ── 배점 추출 (문제별) + 총점 ──
  const pointsData = parsed.problems.map((p) => extractPoints(p.content));
  const anyPoints = pointsData.some((d) => d.points != null);
  const totalPoints = anyPoints
    ? Math.round(pointsData.reduce((s, d) => s + (d.points || 0), 0))
    : parsed.problems.length * 4; // 배점 없는 파일(해강중 등)은 4점 균등 폴백

  // ── exam INSERT ──
  const { data: examRow, error: examErr } = await supabase
    .from('exams')
    .insert({
      title,
      description: `HML 가져오기: ${ctx.sourceName || title} (${parsed.problems.length}문항)`,
      status: 'DRAFT',
      created_by: ctx.createdBy,
      institute_id: ctx.instituteId,
      book_group_id: ctx.bookGroupId ?? null,
      total_points: totalPoints,
      time_limit_minutes: 50,
      subject_track: 'math',
    })
    .select('id')
    .single();
  if (examErr || !examRow) {
    // ★ 자산화 안전: exam 생성 실패 시 문제 강행 금지 (orphan 차단)
    return { ok: false, error: `exam INSERT 실패: ${examErr?.message || 'unknown'}` };
  }
  const examId = (examRow as { id: string }).id;

  // ── 문제 INSERT + exam_problems 연결 ──
  let saved = 0;
  let flagged = 0;
  const warningsByNumber: Record<number, string[]> = {};
  for (let i = 0; i < parsed.problems.length; i++) {
    const p = parsed.problems[i];
    const { points: problemPoints, cleaned: contentLatex } = pointsData[i]; // 배점 추출·본문 [N점] 제거
    const isObj = p.choices.length > 0;
    const choices = p.choices.map((c, idx) => normalizeChoice(c, idx));
    const safeAns = isObj ? normalizeObjectiveAnswer(p.answer) : (p.answer || '');

    const answer_json: Record<string, unknown> = {
      finalAnswer: safeAns,
      correct_answer: safeAns,
      type: isObj ? 'multiple_choice' : 'short_answer',
      choices,
    };
    // ★ 표 객관식 — 컬럼 헤더 (있으면 클라우드가 보기를 표로 렌더, | 셀구분)
    if (p.choiceHeaders && p.choiceHeaders.length > 0) {
      answer_json.choiceHeaders = p.choiceHeaders;
    }
    // ★ 원본 보기 배치 — 자산화 기본 세팅을 원본과 같게 (OCR 과 동일). 수동 변경은 그대로 우선.
    if (typeof p.choiceLayout === 'number') {
      answer_json.choiceLayout = p.choiceLayout;
    }

    // ── 그림 dataURL → Storage 업로드 → public URL. (실패 시 null)
    //   ★ MIME/확장자를 data URL 에서 도출 — BMP/JPEG 를 png 로 박으면 브라우저 렌더 깨짐(해강중 #8).
    //   ★ 자산화 crop 과 동일 prefix(problem-crops/) — /api/storage/image 화이트리스트 통과.
    const uploadDataUrl = async (dataUrl: string, name: string): Promise<string | null> => {
      try {
        const mime = dataUrl.match(/^data:(image\/[\w.+-]+);base64,/)?.[1] || 'image/png';
        const ext = mime === 'image/jpeg' ? 'jpg' : (mime.split('/')[1] || 'png');
        const buffer = Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64');
        const path = `problem-crops/hml-${examId}/${name}.${ext}`;
        const { error } = await supabase.storage.from('source-files').upload(path, buffer, { contentType: mime, upsert: true });
        if (error) return null;
        return supabase.storage.from('source-files').getPublicUrl(path).data?.publicUrl ?? null;
      } catch { return null; }
    };

    // 본문(stem) 그림 → images[](figure_crop). 본문 [도형] 마커 자리에 렌더.
    const images: Array<{ type: string; url: string }> = [];
    for (let gi = 0; gi < p.imagesBase64.length; gi++) {
      const url = await uploadDataUrl(p.imagesBase64[gi], `p${p.number}-${gi}`);
      if (url) images.push({ type: 'figure_crop', url });
    }

    // ★ 그림 객관식 — 보기별 이미지 → answer_json.choiceImages (보기 인덱스 정렬, null=텍스트 보기).
    let choiceImagesPresent = 0;
    if (p.choiceImagesBase64?.some(Boolean)) {
      const choiceImages: (string | null)[] = [];
      for (let ci = 0; ci < p.choiceImagesBase64.length; ci++) {
        const durl = p.choiceImagesBase64[ci];
        const url = durl ? await uploadDataUrl(durl, `p${p.number}-choice-${ci}`) : null;
        if (url) choiceImagesPresent++;
        choiceImages.push(url);
      }
      answer_json.choiceImages = choiceImages;
    }

    // ── ★ 검증 루프 (룰베이스, 비용 0) — 의심 문제를 ⚠️ 플래그 → 펼쳐보기에서 검수 ──
    const warnings = verifyHmlProblem({
      number: p.number,
      content: contentLatex,
      choices,
      answer: safeAns,
      isObjective: isObj,
      imagesExpected: (contentLatex.match(/\[도형\]/g) || []).length,
      imagesSaved: images.length,
      choiceImagesPresent,
    });
    if (warnings.length) {
      answer_json._hmlWarnings = warnings; // 펼쳐보기 ⚠️ 배지가 읽음
      warningsByNumber[p.number] = warnings;
      flagged++;
    }

    const { data: probRow, error: probErr } = await supabase
      .from('problems')
      .insert({
        content_latex: contentLatex,
        solution_latex: '',
        answer_json,
        images,
        status: 'PENDING_REVIEW',
        source_number: p.number,
        source_name: ctx.sourceName || title,
        institute_id: ctx.instituteId,
        created_by: ctx.createdBy,
        subject_track: 'math',
        tags: [],
      })
      .select('id')
      .single();
    if (probErr || !probRow) {
      console.warn(`[createExamFromHml] 문제 ${p.number} INSERT 실패: ${probErr?.message}`);
      continue;
    }
    saved++;
    const { error: epErr } = await supabase.from('exam_problems').insert({
      exam_id: examId,
      problem_id: (probRow as { id: string }).id,
      sequence_number: i + 1,
      points: problemPoints, // 본문 [N점] 추출값 (없으면 null)
    });
    if (epErr) console.warn(`[createExamFromHml] exam_problems 연결 실패 (${p.number}): ${epErr.message}`);
  }

  return { ok: true, examId, savedProblems: saved, flaggedProblems: flagged, warningsByNumber };
}
