// ============================================================================
// 도형 교정 이력 기반 few-shot 예시 조회 + 실패 교훈 주입
// figure_corrections 테이블에서 유사 사례를 가져와 SVG 생성 프롬프트에 넣는다.
//
// 2026-10-06 재정비 (대표 "학습이 잘 되어 모두 SVG 로 가는 게 제일 좋다"):
//   · 종전엔 figure_type 과 mathsecr_type_code 가 거의 비어 있어 "최근 3건 아무거나"가 들어갔다 → 단계별 조회(도형+단원 → 도형 → 최근).
//   · 사람이 붙여넣은 SVG(gold) 를 먼저, 검증기를 통과한 자동 SVG(silver, svg_verified) 로 채운다.
//   · 검증기가 떨어뜨린 SVG(svg_verify_failed) 의 지적 사항을 "같은 종류 도형에서 전에 한 실수"로 함께 넣는다(사람 손 없이 매 건 쌓이는 신호).
//   · typeCode 는 AsyncLocalStorage 로 전달 — 라우트가 figureRequestContext.run({ typeCode }, () => interpretImage(...)) 로 감싼다.
// ============================================================================

import { AsyncLocalStorage } from 'node:async_hooks';
import { supabaseAdmin } from '@/lib/supabase/server';

export const figureRequestContext = new AsyncLocalStorage<{ typeCode?: string; problemId?: string }>();

export interface CorrectionExample {
  id: string;
  problem_content: string | null;
  figure_type: string | null;
  original_svg: string | null;
  corrected_svg_source: string | null;
  corrected_image_url: string | null;
  correction_type: string;
}

export interface FailureLesson {
  id: string;
  figure_type: string | null;
  correction_type: string;
  correction_note: string | null;
}

const GOLD_TYPES = ['svg_paste', 'svg_file_upload'];
const SILVER_TYPES = ['svg_verified'];
const SELECT = 'id, problem_content, figure_type, original_svg, corrected_svg_source, corrected_image_url, correction_type';

/** 단원 코드를 중단원(앞 3마디)까지 자른다: MS06-01-02-01-01 → MS06-01-02 */
export function typeCodePrefix(typeCode?: string | null): string | null {
  if (!typeCode) return null;
  const parts = typeCode.split('-');
  return parts.length >= 3 ? parts.slice(0, 3).join('-') : typeCode;
}

async function queryExamples(opts: { types: string[]; figureType?: string; codePrefix?: string | null; limit: number; excludeIds: Set<string> }): Promise<CorrectionExample[]> {
  if (!supabaseAdmin) return [];
  let q = supabaseAdmin
    .from('figure_corrections')
    .select(SELECT)
    .in('correction_type', opts.types)
    .not('corrected_svg_source', 'is', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit + opts.excludeIds.size);
  if (opts.figureType) q = q.eq('figure_type', opts.figureType);
  if (opts.codePrefix) q = q.like('mathsecr_type_code', `${opts.codePrefix}%`);
  const { data, error } = await q;
  if (error) { console.warn('[correction-examples] Query failed:', error.message); return []; }
  return ((data || []) as CorrectionExample[]).filter((r) => !opts.excludeIds.has(r.id)).slice(0, opts.limit);
}

/**
 * 주어진 도형 타입/단원에 맞는 교정 사례(SVG 있는 것)를 단계별로 모은다.
 *   1) 같은 도형 + 같은 중단원  2) 같은 도형  3) 최근 아무 도형
 *   각 단계에서 gold(사람 SVG) 먼저, 모자라면 silver(검증 통과 자동 SVG).
 */
export async function fetchCorrectionExamples(opts: {
  figureType?: string;
  typeCode?: string;
  limit?: number;
}): Promise<CorrectionExample[]> {
  if (!supabaseAdmin) return [];
  const limit = opts.limit || 3;
  const typeCode = opts.typeCode ?? figureRequestContext.getStore()?.typeCode;
  const codePrefix = typeCodePrefix(typeCode);
  const out: CorrectionExample[] = [];
  const seen = new Set<string>();
  const tiers: Array<{ figureType?: string; codePrefix?: string | null }> = [];
  if (opts.figureType && codePrefix) tiers.push({ figureType: opts.figureType, codePrefix });
  if (opts.figureType) tiers.push({ figureType: opts.figureType });
  tiers.push({});
  try {
    for (const tier of tiers) {
      for (const types of [GOLD_TYPES, SILVER_TYPES]) {
        if (out.length >= limit) break;
        const rows = await queryExamples({ types, figureType: tier.figureType, codePrefix: tier.codePrefix, limit: limit - out.length, excludeIds: seen });
        for (const r of rows) { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } }
      }
      if (out.length >= limit) break;
    }
    if (out.length > 0) {
      const ids = out.map((d) => d.id);
      Promise.resolve(supabaseAdmin.rpc('increment_example_count', { correction_ids: ids })).catch(() => {});
    }
    return out;
  } catch (err) {
    console.warn('[correction-examples] Error:', err);
    return out;
  }
}

/**
 * 같은 종류 도형에서 검증기가 떨어뜨린 SVG 의 지적 사항(실패 교훈). 사람 거부(use_original/image_upload)에 메모가 있으면 그것도.
 */
export async function fetchFailureLessons(opts: { figureType?: string; typeCode?: string; limit?: number }): Promise<FailureLesson[]> {
  if (!supabaseAdmin) return [];
  const limit = opts.limit || 6;
  const codePrefix = typeCodePrefix(opts.typeCode ?? figureRequestContext.getStore()?.typeCode);
  const run = async (figureType?: string, prefix?: string | null) => {
    let q = supabaseAdmin!
      .from('figure_corrections')
      .select('id, figure_type, correction_type, correction_note')
      .in('correction_type', ['svg_verify_failed', 'use_original', 'image_upload', 'diagram_db'])
      .not('correction_note', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (figureType) q = q.eq('figure_type', figureType);
    if (prefix) q = q.like('mathsecr_type_code', `${prefix}%`);
    const { data, error } = await q;
    if (error) { console.warn('[correction-examples] lessons query failed:', error.message); return []; }
    return (data || []) as FailureLesson[];
  };
  try {
    let rows: FailureLesson[] = [];
    if (opts.figureType && codePrefix) rows = await run(opts.figureType, codePrefix);
    if (rows.length < limit && opts.figureType) rows = rows.concat(await run(opts.figureType));
    if (rows.length === 0) rows = await run();
    // 같은 문장 중복 제거
    const seen = new Set<string>();
    const out: FailureLesson[] = [];
    for (const r of rows) {
      const key = (r.correction_note || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key); out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  } catch (err) {
    console.warn('[correction-examples] lessons error:', err);
    return [];
  }
}

/**
 * 교정 예시를 SVG 생성 프롬프트에 주입할 텍스트로 변환
 */
export function buildCorrectionPromptBlock(examples: CorrectionExample[]): string {
  if (examples.length === 0) return '';

  const blocks = examples.map((ex, i) => {
    const parts: string[] = [`=== 교정 사례 ${i + 1}${ex.correction_type === 'svg_verified' ? ' (검증 통과 자동 생성)' : ''} ===`];

    if (ex.problem_content) {
      parts.push(`문제: ${ex.problem_content.slice(0, 300)}`);
    }
    if (ex.figure_type) {
      parts.push(`도형 유형: ${ex.figure_type}`);
    }
    if (ex.original_svg) {
      parts.push(`[AI가 처음 생성한 SVG — 틀린 것]\n${ex.original_svg.slice(0, 2000)}`);
    }
    if (ex.corrected_svg_source) {
      parts.push(`[사용자가 교정한 SVG — 올바른 것]\n${ex.corrected_svg_source.slice(0, 3000)}`);
    }
    if (ex.corrected_image_url && !ex.corrected_svg_source) {
      parts.push(`[사용자가 교정한 이미지 URL — 참고용]\n${ex.corrected_image_url}`);
    }

    return parts.join('\n');
  });

  return `\n\n★★★ 교정 이력 기반 참고 사례 ★★★
아래는 과거에 AI가 생성한 SVG를 사용자가 직접 교정한 사례입니다.
교정된 SVG의 패턴(선 굵기, 라벨 위치, 각도 표시 방법, 보조선 등)을 참고하여 더 정확한 SVG를 생성하세요.

${blocks.join('\n\n')}
`;
}

/** 실패 교훈 블록 — 짧게(토큰 아낌). 같은 종류 도형에서 검증기가 짚은 차이를 "피하라"로 */
export function buildFailureLessonsBlock(lessons: FailureLesson[]): string {
  if (lessons.length === 0) return '';
  const lines = lessons.map((l) => `- ${(l.correction_note || '').replace(/\s+/g, ' ').slice(0, 160)}`);
  return `\n\n★ 같은 종류 도형에서 이전 SVG 가 원본과 달랐던 점 (반드시 피할 것)\n${lines.join('\n')}\n`;
}
