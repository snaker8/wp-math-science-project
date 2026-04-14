// ============================================================================
// 도형 교정 이력 기반 few-shot 예시 조회
// figure_corrections 테이블에서 유사 사례를 가져와 SVG 생성 프롬프트에 주입
// ============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';

export interface CorrectionExample {
  id: string;
  problem_content: string | null;
  figure_type: string | null;
  original_svg: string | null;
  corrected_svg_source: string | null;
  corrected_image_url: string | null;
  correction_type: string;
}

/**
 * 주어진 도형 타입/문제 유형에 맞는 교정 사례를 조회
 * SVG 코드 또는 이미지 URL이 있는 교정을 반환 (few-shot + 참고 이미지 활용)
 */
export async function fetchCorrectionExamples(opts: {
  figureType?: string;
  typeCode?: string;
  limit?: number;
}): Promise<CorrectionExample[]> {
  if (!supabaseAdmin) return [];

  try {
    const limit = opts.limit || 3;

    // ★ SVG 또는 이미지가 있는 교정 모두 가져오기 (이미지 교정도 참고 자료로 활용)
    let query = supabaseAdmin
      .from('figure_corrections')
      .select('id, problem_content, figure_type, original_svg, corrected_svg_source, corrected_image_url, correction_type')
      .or('corrected_svg_source.not.is.null,corrected_image_url.not.is.null')
      .order('created_at', { ascending: false })
      .limit(limit);

    // 같은 도형 타입 우선
    if (opts.figureType) {
      query = query.eq('figure_type', opts.figureType);
    }

    // 같��� 단원(중단원까지) 우선 매칭
    if (opts.typeCode) {
      const prefix = opts.typeCode.split('-').slice(0, 3).join('-');
      query = query.like('mathsecr_type_code', `${prefix}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('[correction-examples] Query failed:', error.message);
      return [];
    }

    // 활용 카운트 증가 (fire & forget)
    if (data && data.length > 0) {
      const ids = data.map(d => d.id);
      Promise.resolve(supabaseAdmin.rpc('increment_example_count', { correction_ids: ids })).catch(() => {});
    }

    return (data || []) as CorrectionExample[];
  } catch (err) {
    console.warn('[correction-examples] Error:', err);
    return [];
  }
}

/**
 * 교정 예시를 SVG 생성 프롬프트에 주입할 텍스트로 변환
 */
export function buildCorrectionPromptBlock(examples: CorrectionExample[]): string {
  if (examples.length === 0) return '';

  const blocks = examples.map((ex, i) => {
    const parts: string[] = [`=== 교정 사례 ${i + 1} ===`];

    if (ex.problem_content) {
      // 문제 내용 요약 (너무 길면 앞부분만)
      const short = ex.problem_content.length > 200
        ? ex.problem_content.slice(0, 200) + '...'
        : ex.problem_content;
      parts.push(`문제: ${short}`);
    }

    if (ex.original_svg) {
      parts.push(`[원래 AI가 생성한 SVG — 품질 부족으로 사용자가 교체함]`);
    }

    if (ex.corrected_svg_source) {
      // SVG가 너무 길면 앞부분만 (토큰 절약)
      const svg = ex.corrected_svg_source.length > 3000
        ? ex.corrected_svg_source.slice(0, 3000) + '\n<!-- ... truncated -->'
        : ex.corrected_svg_source;
      parts.push(`[사용��가 제공한 올바른 SVG]:\n${svg}`);
    }

    // ★ 이미지 교정: SVG 없이 이미지만 교체한 경우 → 참고 이미지로 활용
    if (!ex.corrected_svg_source && ex.corrected_image_url) {
      parts.push(`[사용자가 교체한 고품질 참고 이미지]: ${ex.corrected_image_url}`);
      parts.push(`→ 이 이미지의 스타일과 정확도를 참고하여 SVG를 생성하세요.`);
    }

    return parts.join('\n');
  });

  return [
    '\n\n===== 이전 교정 사례 (참고용 few-shot) =====',
    '아���는 과거에 AI가 생성한 SVG가 부정확하여 사용자가 직접 교���한 사례입니다.',
    '비슷한 유형의 도형을 그릴 때 이 교정 사���의 스타일과 정확도를 참고하세요.',
    '',
    ...blocks,
    '===== 교정 사례 끝 =====\n',
  ].join('\n');
}
