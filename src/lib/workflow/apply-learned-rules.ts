// ============================================================================
// 자산화 시점 학습 규칙 자동 적용 (2026-05-19)
//
// 배경: 사용자 의도 — "수학도 코드 수정하면 자동학습"
//   카드 편집 모달에서 사용자가 본문 정정 시 latex_render_corrections 에
//   (original, corrected) 쌍 저장됨. occurrences 누적 → confidence ↑.
//
//   기존: confidence ≥ 0.7 규칙은 auto-fix 라우트 (사용자 수동 트리거) 에서만 적용.
//   변경: **자산화 시점에도 자동 적용** — 새 자산화 직후 학습 규칙 변환.
//   효과: 수학 (Mathpix) / 과학 (Gemini) OCR 모두 적용 — 같은 사고 반복 차단.
//
// 안전성:
//   - confidence ≥ 0.7 규칙만 적용 (충분한 occurrences 누적된 케이스)
//   - status='disabled' 인 규칙은 제외 — 관리자가 막을 수 있음
//   - 적용 결과 로그 출력 — 사용자가 콘솔에서 변환 확인 가능
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type LearnedRule = {
  id: string;
  original: string;
  corrected: string;
  confidence: number;
};

/** 자산화 시점에 적용할 학습 규칙 로드 */
export async function loadLearnedRules(sb: SupabaseClient): Promise<LearnedRule[]> {
  try {
    const { data, error } = await sb
      .from('latex_render_corrections')
      .select('id, original_fragment, corrected_fragment, confidence, status')
      .in('status', ['auto_applied', 'learning'])
      .gte('confidence', 0.7)
      .order('confidence', { ascending: false })
      .limit(200);
    if (error) {
      console.warn('[learned-rules] load error:', error.message);
      return [];
    }
    return (data || []).map(r => ({
      id: r.id,
      original: r.original_fragment,
      corrected: r.corrected_fragment,
      confidence: r.confidence,
    }));
  } catch (e) {
    console.warn('[learned-rules] load exception:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** 본문에 학습 규칙 적용 — 단순 문자열 치환
 *
 *  안전: 규칙은 confidence ≥ 0.7 만. 단순 replace 이므로 fragment 가 정확히
 *        일치할 때만 변환. 부분 매치 사고 방지 — original 이 substring 형태면
 *        본문 anywhere 에 매치. 즉 짧은 패턴은 신중. 학습 회로의 occurrences
 *        가드가 안전망.
 */
export function applyLearnedRules(
  content: string,
  rules: LearnedRule[]
): { result: string; appliedCount: number; appliedRules: string[] } {
  if (!content || rules.length === 0) return { result: content, appliedCount: 0, appliedRules: [] };
  let result = content;
  let appliedCount = 0;
  const appliedRules: string[] = [];
  for (const rule of rules) {
    if (!rule.original || !rule.corrected) continue;
    if (result.includes(rule.original)) {
      const before = result;
      result = result.split(rule.original).join(rule.corrected);
      const changes = (before.length - result.length) / Math.max(1, rule.original.length - rule.corrected.length);
      appliedCount += Math.abs(Math.round(changes));
      appliedRules.push(`${rule.original} → ${rule.corrected}`);
    }
  }
  return { result, appliedCount, appliedRules };
}
