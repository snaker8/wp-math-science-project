// ============================================================================
// 도형 학습 신호 기록 — 검증기 결과를 figure_corrections 에 자동으로 쌓는다 (사람 손 없이 매 건).
//
// 2026-10-06 대표 "학습이 잘 되어 모두 SVG 로 가는 게 제일 좋다" → 회로 점검 결과:
//   · SVG 프롬프트 사례는 사람이 붙여넣은 112건뿐, 최근 60일 교정 41건은 이미지라 한 건도 안 들어감.
//   · 검증기가 떨어뜨린 SVG(원본·틀린 SVG·짚은 차이)는 버려지고 있었다 → 여기서 기록해 다음 프롬프트의 "실패 교훈"으로.
//   · 검증기를 통과한 SVG 는 silver 사례(svg_verified)로 — 사람 SVG(gold) 가 모자랄 때 채운다.
// ============================================================================
import { supabaseAdmin } from '@/lib/supabase/server';

/** SVG 내용에서 figureType 자동 추론 — 학습 데이터 검색용 태그 누락 방지 (figure-corrections 라우트와 공용) */
export function inferFigureTypeFromSvg(svg: string): string | null {
  if (!svg) return null;
  const s = svg.toLowerCase();
  const hasAxisLabels = /<text[^>]*>\s*[xy]\s*<\/text>/i.test(svg);
  const hasOriginLabel = /<text[^>]*>\s*o\s*<\/text>/i.test(svg);
  const hasArrow = /<polygon[^>]*points/i.test(svg) && /(arrow|polyline.*line)/i.test(s);
  if (hasAxisLabels || (hasOriginLabel && hasArrow)) return 'graph';
  const lineCount = (svg.match(/<line/gi) || []).length;
  const textCount = (svg.match(/<text/gi) || []).length;
  if (lineCount >= 6 && textCount >= 4 && /grid|table/i.test(s)) return 'table';
  const circleCount = (svg.match(/<circle/gi) || []).length;
  if (circleCount >= 2 && textCount >= 2 && lineCount === 0) return 'diagram';
  if (lineCount === 1 && /tick|number\s*line|수직선/i.test(s)) return 'number_line';
  if (/<polygon|<polyline/i.test(svg) && !hasAxisLabels) return 'geometry';
  // Opal 등 외부 도구 SVG 는 <path>/<rect> 로 그린다 — 축 라벨이 없으면 도형으로 본다 (2026-10-06 백필 24건이 이 규칙으로 잡힘)
  if (/<path|<rect|<circle|<ellipse/i.test(svg) && !hasAxisLabels) return 'geometry';
  return null;
}

/** 문제의 수학비서 분류 코드(MS…) — classifications 테이블. 없으면 null */
export async function fetchProblemTypeCode(problemId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('classifications')
    .select('type_code, expanded_type_code')
    .eq('problem_id', problemId)
    .limit(1)
    .maybeSingle();
  const code = (data?.type_code as string | undefined) || (data?.expanded_type_code as string | undefined) || null;
  return code && /^MS/.test(code) ? code : code || null;
}

export interface SvgVerifyOutcome {
  problemId: string;
  svg: string;
  figureType?: string | null;
  typeCode?: string | null;
  ok: boolean;
  score: number;
  issues: string[];
  labels?: string[];
  cropUrl?: string | null;
  contentLatex?: string | null;
  model?: string;
}

/**
 * 검증 결과 기록. 실패 = svg_verify_failed(original_svg + correction_note=지적), 통과 = svg_verified(corrected_svg_source).
 * fire-and-forget 으로 쓰고, 실패해도 생성 흐름엔 영향 없다.
 */
export async function recordSvgVerifyOutcome(o: SvgVerifyOutcome): Promise<void> {
  if (!supabaseAdmin) return;
  const figureType = o.figureType || inferFigureTypeFromSvg(o.svg);
  const note = o.ok ? null : (o.issues.join(' / ').slice(0, 1000) || `score ${o.score}`);
  const row = {
    problem_id: o.problemId,
    problem_content: o.contentLatex ? o.contentLatex.slice(0, 2000) : null,
    mathsecr_type_code: o.typeCode || null,
    figure_type: figureType,
    original_figure_source: 'ai_generated',
    original_svg: o.ok ? null : o.svg.slice(0, 50000),
    corrected_svg_source: o.ok ? o.svg.slice(0, 50000) : null,
    original_image_url: o.cropUrl || null,
    correction_type: o.ok ? 'svg_verified' : 'svg_verify_failed',
    correction_note: note,
    auto_analysis: { score: o.score, issues: o.issues, labels: o.labels || [], model: o.model || null, at: new Date().toISOString() },
  };
  const { error } = await supabaseAdmin.from('figure_corrections').insert(row);
  if (error) console.warn('[figure-learning] 기록 실패:', error.message);
  else console.log(`[figure-learning] ${row.correction_type} 기록 (type=${figureType || '-'}, code=${o.typeCode || '-'}, score=${o.score})`);
}
