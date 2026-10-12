// ============================================================================
// 고난도 문항 「공략(해결 전략)」 검증 — 학부모 리포트에 틀린 풀이가 나가지 않게
//
// ★ 2026-10-12 대표: "리포트 해결전략에 잘못된 풀이가 들어가면 되나? 이러면 어떻게 게시하나."
//   실측(엄궁중 8번): 그림 없이 텍스트만 보고 만든 공략이 "∠AOF = ∠AOB + ∠BOF" 처럼 점 위치와 안 맞는 분해를 했다.
//   해결: ① 생성 때 그림·저장 해설을 같이 준다(ai-analysis route) ② 생성 후 문항마다 검산 — 모델이 공략대로 실제로 풀어
//   최종 답을 내고, 저장된 정답과 맞아야 verified. 틀리면 한 번 다시 쓰고 다시 검산. 그래도 안 맞으면 verified=false →
//   리포트는 공략을 숨기고 출제 의도만 보여 준다(강사 화면엔 "검증 실패" 표시).
//   비용: 문항당 Sonnet 1~2회(그림 포함 ~2.5K 입력, ~400 출력) ≈ 10~25원. 시험지당 고난도 4문항 → 40~100원.
//   「AI 분석 생성」 버튼을 누를 때만 돈다 — 일괄 재실행 없음.
// ============================================================================

import { CLAUDE_MODELS } from '@/lib/claude/model-params';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = CLAUDE_MODELS.SONNET;

export interface StrategyVerifyInput {
  number: number;
  content: string;
  /** 저장된 정답 (없으면 '') */
  answer: string;
  /** 저장된 해설 (없으면 '') */
  solution: string;
  strategy: string;
  /** 문제 그림 (base64, 없으면 undefined) */
  image?: { mediaType: string; data: string };
}

export interface StrategyVerifyResult {
  verified: boolean;
  strategy: string;
  /** 모델이 공략대로 풀어 낸 최종 답 */
  derivedAnswer: string;
  /** 틀렸을 때 사유 (강사 화면용) */
  issue?: string;
  /** 다시 써서 통과한 경우 true */
  revised?: boolean;
  calls: number;
}

/** 정답 비교용 정규화 — ①~⑤·(1)~(5)·"3번" 은 숫자로, $·공백·단위 제거 */
export function normalizeAnswerForCompare(s: string): string {
  let t = (s || '').trim();
  const circled = '①②③④⑤';
  if (t.length === 1 && circled.includes(t)) return String(circled.indexOf(t) + 1);
  t = t.replace(/^\(?([1-5])\)?\s*번?$/, '$1');
  t = t.replace(/\$/g, '').replace(/\\\(|\\\)/g, '').replace(/\\left|\\right/g, '');
  t = t.replace(/\^\{\\circ\}|\^\\circ|°|도/g, '');
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2').replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2');
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
  t = t.replace(/[\s{}]/g, '').replace(/cm2|cm\^2|cm|m\^2|m2|개|명|점|원/g, '');
  return t.toLowerCase();
}

export function answersMatch(derived: string, stored: string): boolean {
  const a = normalizeAnswerForCompare(derived);
  const b = normalizeAnswerForCompare(stored);
  if (!a || !b) return false;
  if (a === b) return true;
  // 둘 다 숫자면 수치 비교 (126 vs 126.0, 1/2 vs 0.5)
  const num = (x: string): number | null => {
    const m = x.match(/^(-?\d+(?:\.\d+)?)(?:\/(-?\d+(?:\.\d+)?))?$/);
    if (!m) return null;
    const n = parseFloat(m[1]); const d = m[2] ? parseFloat(m[2]) : 1;
    return d === 0 ? null : n / d;
  };
  const na = num(a), nb = num(b);
  return na !== null && nb !== null && Math.abs(na - nb) < 1e-6;
}

type Content = Array<Record<string, unknown>>;

async function callClaude(apiKey: string, system: string, content: Content, maxTokens = 1500): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (j.content || []).map((c) => (c.type === 'text' ? c.text || '' : '')).join('').trim();
}

function parseJson<T>(raw: string): T | null {
  const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(raw.slice(s, e + 1)) as T; } catch { return null; }
}

const VERIFY_SYSTEM = `당신은 한국 중·고등 수학 교사입니다. 주어진 문제·그림·(있다면) 해설·정답을 보고, 제시된 「공략」이 실제로 맞는 풀이인지 검산합니다.
- 공략의 각 단계를 그대로 따라 끝까지 풀어 최종 답을 구하세요. 그림이 있으면 점·선의 위치는 반드시 그림대로 판단하세요(텍스트만 보고 각을 분해하지 마세요).
- 단계 중 하나라도 성립하지 않으면(예: 점이 그 각 안에 없는데 각을 분해, 잘못된 성질 적용) ok=false.
- 순수 JSON 만 출력: {"ok": true|false, "derivedAnswer": "공략대로 풀어 나온 최종 답(객관식은 보기 번호 숫자)", "issue": "틀린 단계와 이유 한두 문장(ok=true 면 빈 문자열)"}
- JSON 문자열 안의 백슬래시는 \\\\ 로 이중 이스케이프.`;

const REWRITE_SYSTEM = `당신은 한국 중·고등 수학 교사입니다. 주어진 문제·그림·(있다면) 해설·정답에 맞는 올바른 「공략(해결 전략)」을 다시 씁니다.
- 반드시 [1단계] [2단계] [3단계] 형식, 각 단계는 학생이 따라 할 수 있는 핵심 아이디어 한두 문장. LaTeX 는 $…$.
- 그림이 있으면 점·선의 위치를 그림대로. 저장된 해설이 있으면 그 흐름을 따르세요. 마지막 단계에서 정답이 나와야 합니다.
- 순수 JSON 만 출력: {"strategy": "…", "derivedAnswer": "이 공략대로 풀어 나온 최종 답(객관식은 보기 번호 숫자)"}
- JSON 문자열 안의 백슬래시는 \\\\ 로 이중 이스케이프.`;

function problemBlock(input: StrategyVerifyInput, strategy?: string): Content {
  const parts: Content = [];
  if (input.image) parts.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  const text = [
    `# ${input.number}번 문항${input.image ? ' (위 그림이 이 문항의 그림)' : ''}`,
    input.content,
    input.answer ? `\n# 저장된 정답\n${input.answer}` : '\n# 저장된 정답\n(없음)',
    input.solution ? `\n# 저장된 해설\n${input.solution}` : '',
    strategy !== undefined ? `\n# 검산할 공략\n${strategy}` : '',
  ].filter(Boolean).join('\n');
  parts.push({ type: 'text', text });
  return parts;
}

/**
 * 공략 검산 → (실패 시) 1회 재작성 → 재검산. 최대 2회 호출.
 * API 키가 없거나 호출이 터지면 verified=false 없이 원문 유지(throws 하지 않음) — 분석 생성 자체를 막지 않는다.
 */
export async function verifyAndFixStrategy(input: StrategyVerifyInput, apiKey: string): Promise<StrategyVerifyResult> {
  let calls = 0;
  const original = input.strategy;
  try {
    calls++;
    const v = parseJson<{ ok?: boolean; derivedAnswer?: string; issue?: string }>(await callClaude(apiKey, VERIFY_SYSTEM, problemBlock(input, original), 800));
    const derived = String(v?.derivedAnswer ?? '');
    const okByAnswer = input.answer ? answersMatch(derived, input.answer) : true;
    if (v?.ok === true && okByAnswer) {
      return { verified: true, strategy: original, derivedAnswer: derived, calls };
    }
    const issue = (v?.issue || '').trim() || (input.answer ? `공략대로 풀면 ${derived || '?'} 가 나와 정답(${input.answer})과 다름` : '검산 실패');

    // 한 번 다시 쓴다
    calls++;
    const r = parseJson<{ strategy?: string; derivedAnswer?: string }>(await callClaude(apiKey, REWRITE_SYSTEM, problemBlock(input), 1500));
    const newStrategy = (r?.strategy || '').trim();
    const newDerived = String(r?.derivedAnswer ?? '');
    if (newStrategy && (input.answer ? answersMatch(newDerived, input.answer) : true)) {
      return { verified: true, strategy: newStrategy, derivedAnswer: newDerived, issue, revised: true, calls };
    }
    return { verified: false, strategy: original, derivedAnswer: derived, issue: `${issue} / 재작성도 정답 불일치(${newDerived || '?'})`, calls };
  } catch (e) {
    return { verified: false, strategy: original, derivedAnswer: '', issue: `검산 호출 실패: ${e instanceof Error ? e.message : String(e)}`, calls };
  }
}
