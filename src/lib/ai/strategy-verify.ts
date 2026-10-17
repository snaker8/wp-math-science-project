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
// ★ 2026-10-13: 검산·재작성은 Opus — Sonnet 이 그림(일직선인 B·E·C)을 정삼각형으로 읽고 통과시킨 사고(동백중 15번).
//   문항당 호출 1~2회라 비용 영향은 제한적(≈ 시험지당 200~500원). STRATEGY_VERIFY_MODEL 로 바꿀 수 있다.
// ★ 2026-10-13 대표 "빼라" — 비용 때문에 Sonnet 으로 복귀. 절차(그림 사실 판독·독립 풀이 대조·원본 그림)는 그대로.
const MODEL = process.env.STRATEGY_VERIFY_MODEL || CLAUDE_MODELS.SONNET;

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
  /** ★ 그림을 글로 옮긴 사실(readFigureFacts) — 모델이 그림을 잘못 읽는 것을 막는 참고 */
  figureFacts?: string;
  /** ★ 시험지 학년 (중1·중2·고1 …) — 그 학년까지 배운 개념만 쓰게 (2026-10-17 학장중 중1-2 에 √ 공략) */
  grade?: string;
}

/** 학년별로 아직 안 배운 도구 — 공략·재작성·검산이 같은 표를 본다 */
export function gradeScopeNote(grade?: string | null): string {
  const g = (grade || '').replace(/\s/g, '');
  if (/^중1/.test(g)) return '중1 — 제곱근(√)·무리수·피타고라스 정리·삼각비·인수분해·이차방정식은 아직 안 배움. 넓이·길이는 비(比)와 등분, 기본 도형 성질로.';
  if (/^중2/.test(g)) return '중2 — 제곱근(√)·무리수·삼각비·이차방정식은 아직 안 배움(피타고라스 정리는 중2-2 에서 배움). 넓이·길이는 비와 등분, 합동·닮음으로.';
  if (/^중3/.test(g)) return '중3 — 삼각비·제곱근·이차방정식까지. 고등 도구(벡터·미적분·삼각함수)는 안 배움.';
  if (/^고1|공통수학/.test(g)) return '고1 — 공통수학1·2 범위. 미적분·삼각함수·벡터는 안 배움.';
  return g ? `${g} — 그 학년까지 배운 개념만.` : '';
}

/** 정적 가드 — 중1 공략에 √ 가 있으면 학년 범위 초과 (모델 판단을 기다리지 않고 재작성으로 보낸다) */
export function exceedsGradeScope(strategy: string, grade?: string | null): string | null {
  const g = (grade || '').replace(/\s/g, '');
  if (/^중1/.test(g) && /\\sqrt|√|제곱근|피타고라스|삼각비/.test(strategy)) return '중1 범위를 넘는 도구(제곱근·피타고라스·삼각비) 사용';
  if (/^중2/.test(g) && /삼각비|이차방정식/.test(strategy)) return '중2 범위를 넘는 도구(삼각비·이차방정식) 사용';
  return null;
}

export interface StrategyVerifyResult {
  verified: boolean;
  strategy: string;
  /** 모델이 공략대로 풀어 낸 최종 답 */
  derivedAnswer: string;
  /** 공략을 보지 않고 모델이 독립적으로 푼 답 (저장 정답이 없을 때 대조 기준) */
  independentAnswer?: string;
  /** 틀렸을 때 사유 (강사 화면용) */
  issue?: string;
  /** 다시 써서 통과한 경우 true */
  revised?: boolean;
  /** 대조 기준 답의 출처 — stored(저장 정답) · consensus(독립 풀이 2회 이상 일치) · none(기준 없음) */
  referenceSource?: 'stored' | 'consensus' | 'none';
  /** 기준 답 (consensus 면 AI 가 합의한 답) */
  referenceAnswer?: string;
  calls: number;
}

// ★ 정답이 없는 시험지 (2026-10-17 상당중 "답이 없으니 답을 못 넣었지") — 한 번 푼 답을 기준으로 삼으면 그 풀이가 틀렸을 때 못 거른다.
//   공략을 보지 않고 **따로 두 번** 풀어 일치할 때만 기준 답으로 인정. 어긋나면 세 번째로 다수결. 그래도 없으면 기준 없음(검산 실패).
const SOLVE_SYSTEM = `당신은 한국 중·고등 수학 교사입니다. 주어진 문제(그림 포함)를 처음부터 끝까지 스스로 풀어 최종 답만 확정합니다.
- 그림이 있으면 먼저 그림을 정밀하게 읽습니다. 그림에 없는 성질을 가정하지 마세요.
- 계산을 끝까지 하고, 마지막에 답을 한 번 더 검산하세요.
- 순수 JSON 만 출력: {"answer": "최종 답(객관식은 보기 번호 숫자, 서답형은 값·식)", "check": "검산 한 문장"}
- JSON 문자열 안의 백슬래시는 \\ 로 이중 이스케이프.`;

// ★ 서답형·여러 소문제 답은 글자 비교가 거의 항상 실패한다 (2026-10-17 상당중 23·24 — "(1) △BCG≡△DCE (SAS), (2) DE=5" vs "(1) SAS 합동 (2) 5").
//   글자 비교가 안 맞으면 모델에게 "같은 답인가" 만 묻는다 (짧은 호출). 숫자·보기 번호는 글자 비교로 끝난다.
const AGREE_SYSTEM = `두 수학 답안이 **같은 최종 답**을 말하는지만 판정합니다. 표기·서술 순서·단위·합동 기호의 대응 순서·"DE=" 같은 꾸밈은 무시하고, 각 소문제의 최종 값(수·도형 이름·합동 조건)이 모두 같으면 같은 답입니다. 하나라도 다르면 다른 답입니다.
순수 JSON 만: {"same": true|false, "why": "한 문장"}`;

async function answersAgree(a: string, b: string, apiKey: string): Promise<boolean> {
  if (!a || !b) return false;
  if (answersMatch(a, b)) return true;
  // 둘 다 짧은 숫자/보기 번호면 모델까지 갈 것 없이 다르다
  if (/^\d{1,4}$/.test(normalizeAnswerForCompare(a)) && /^\d{1,4}$/.test(normalizeAnswerForCompare(b))) return false;
  try {
    const r = parseJson<{ same?: boolean }>(await callClaude(apiKey, AGREE_SYSTEM, [{ type: 'text', text: `# 답 A\n${a}\n\n# 답 B\n${b}` }], 200));
    return r?.same === true;
  } catch { return false; }
}

async function solveOnce(input: StrategyVerifyInput, apiKey: string): Promise<string> {
  const r = parseJson<{ answer?: string }>(await callClaude(apiKey, SOLVE_SYSTEM, problemBlock({ ...input, strategy: '' }), 1200));
  return String(r?.answer ?? '').trim();
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
    // ★ 2026-10-13: 검산·재작성은 깊게 — adaptive thinking + effort high (Claude 5.x). max_tokens 는 thinking 몫 포함.
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens + 6000, thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, system, messages: [{ role: 'user', content }] }),
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
순서:
1) 먼저 그림을 정밀하게 읽어 사실을 적습니다 — 어떤 점들이 한 직선 위에 있는지, 어떤 도형이 실제로 그려져 있는지(정삼각형·정사각형·평행 표시·같은 길이 표시·직각 표시·주어진 각도 숫자), 라벨이 없는 점은 없는 대로. 텍스트에 없는 도형(예: "정삼각형 EBC")을 공략이 전제하면 그림에 그 표시가 실제로 있는지 확인하세요.
2) 공략을 보지 않고 스스로 끝까지 풀어 독립적인 답(independentAnswer)을 구합니다.
3) 공략의 각 단계를 그대로 따라 끝까지 풀어 최종 답(derivedAnswer)을 구합니다. 그림의 점·선 위치와 어긋나는 분해, 그림에 없는 성질의 가정, 잘못된 정리 적용이 하나라도 있으면 ok=false.
4) derivedAnswer 와 independentAnswer(또는 저장된 정답)가 다르면 ok=false.
5) 「학년」이 주어지면 공략이 그 학년까지 배운 개념만 쓰는지 확인합니다. 아직 안 배운 도구(예: 중1 에 제곱근·피타고라스, 중학교에 삼각비·벡터)를 쓰면 답이 맞아도 ok=false 로 두고 issue 에 "학년 범위 초과: …" 라고 적습니다.
- 순수 JSON 만 출력: {"ok": true|false, "figureFacts": "그림에서 읽은 사실 한두 문장", "independentAnswer": "스스로 푼 최종 답(객관식은 보기 번호 숫자)", "derivedAnswer": "공략대로 풀어 나온 최종 답(객관식은 보기 번호 숫자)", "issue": "틀린 단계와 이유 한두 문장(ok=true 면 빈 문자열)"}
- JSON 문자열 안의 백슬래시는 \\\\ 로 이중 이스케이프.`;

const REWRITE_SYSTEM = `당신은 한국 중·고등 수학 교사입니다. 주어진 문제·그림·(있다면) 해설·정답에 맞는 올바른 「공략(해결 전략)」을 다시 씁니다.
- 먼저 그림을 정밀하게 읽습니다(어떤 점이 한 직선 위인지, 어떤 도형·표시가 실제로 있는지). 그림에 없는 도형이나 성질을 가정하지 마세요.
- 반드시 [1단계] [2단계] [3단계] (필요하면 [4단계]) 형식. 각 단계는 "무엇을 왜 하는지 + 그 단계의 핵심 계산·근거" 를 2~3문장으로 — 원래 공략보다 간단해지면 안 됩니다(전체 400자 이상). LaTeX 는 $…$.
- 저장된 해설이 있으면 그 흐름을 따르세요. 마지막 단계에서 정답이 나와야 합니다.
- 「학년」이 주어지면 **그 학년까지 배운 개념만** 씁니다. 아직 안 배운 도구가 더 쉬워 보여도 쓰지 말고 그 학년의 방법(비·등분·도형의 기본 성질 등)으로 풉니다.
- 순수 JSON 만 출력: {"strategy": "…", "derivedAnswer": "이 공략대로 풀어 나온 최종 답(객관식은 보기 번호 숫자)"}
- JSON 문자열 안의 백슬래시는 \\\\ 로 이중 이스케이프.`;

function problemBlock(input: StrategyVerifyInput, strategy?: string): Content {
  const parts: Content = [];
  if (input.image) parts.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  const text = [
    `# ${input.number}번 문항${input.image ? ' (위 그림이 이 문항의 그림)' : ''}`,
    input.content,
    input.grade ? `\n# 학년: ${input.grade} — ${gradeScopeNote(input.grade)}` : '',
    input.answer ? `\n# 저장된 정답\n${input.answer}` : '\n# 저장된 정답\n(없음)',
    input.solution ? `\n# 저장된 해설\n${input.solution}` : '',
    input.figureFacts ? `\n# 그림 판독(자동, 참고 — 그림과 어긋나면 그림이 우선)\n${input.figureFacts}` : '',
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
    const v = parseJson<{ ok?: boolean; derivedAnswer?: string; independentAnswer?: string; issue?: string; figureFacts?: string }>(
      await callClaude(apiKey, VERIFY_SYSTEM, problemBlock(input, original), 1400));
    const derived = String(v?.derivedAnswer ?? '');
    const independent = String(v?.independentAnswer ?? '');
    // 대조 기준: 저장된 정답 > 독립 풀이 **합의**(2회 일치, 어긋나면 3회 다수결). 둘 다 없으면 통과시키지 않는다(근거 없는 통과 금지).
    let reference = input.answer;
    let referenceSource: 'stored' | 'consensus' | 'none' = input.answer ? 'stored' : 'none';
    if (!reference && independent) {
      calls++;
      const second = await solveOnce(input, apiKey);
      if (second && await answersAgree(second, independent, apiKey)) { reference = independent; referenceSource = 'consensus'; }
      else if (second) {
        calls++;
        const third = await solveOnce(input, apiKey);
        if (third && await answersAgree(third, independent, apiKey)) { reference = independent; referenceSource = 'consensus'; }
        else if (third && await answersAgree(third, second, apiKey)) { reference = second; referenceSource = 'consensus'; }
      }
    }
    const okByAnswer = reference ? await answersAgree(derived, reference, apiKey) : false;
    const scopeIssue = exceedsGradeScope(original, input.grade);
    if (v?.ok === true && okByAnswer && !scopeIssue) {
      return { verified: true, strategy: original, derivedAnswer: derived, independentAnswer: independent, referenceSource, referenceAnswer: reference, calls };
    }
    const issue = scopeIssue || (v?.issue || '').trim()
      || (reference ? `공략대로 풀면 ${derived || '?'} — 기준 답(${reference})과 다름` : '검산 기준 없음 — 저장 정답이 없고 독립 풀이가 서로 일치하지 않음');

    // 다시 쓴다 — 최대 2회. 기준 답(저장 정답 또는 독립 풀이)을 목표로 명시하고, 재작성본도 같은 기준으로 대조
    let lastDerived = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      calls++;
      const target = reference ? `\n# 이 공략은 반드시 최종 답 「${reference}」 에 도달해야 합니다. 검산에서 지적된 문제: ${issue}` : '';
      const block = problemBlock(input);
      const last = block[block.length - 1] as { type: string; text?: string };
      if (last.type === 'text') last.text = (last.text || '') + target;
      const r = parseJson<{ strategy?: string; derivedAnswer?: string }>(await callClaude(apiKey, REWRITE_SYSTEM, block, 2500));
      const newStrategy = (r?.strategy || '').trim();
      lastDerived = String(r?.derivedAnswer ?? '');
      if (newStrategy && reference && await answersAgree(lastDerived, reference, apiKey) && !exceedsGradeScope(newStrategy, input.grade)) {
        return { verified: true, strategy: newStrategy, derivedAnswer: lastDerived, independentAnswer: independent, issue, revised: true, referenceSource, referenceAnswer: reference, calls };
      }
    }
    return { verified: false, strategy: original, derivedAnswer: derived, independentAnswer: independent, issue: `${issue} / 재작성도 기준 불일치(${lastDerived || '?'})`, referenceSource, referenceAnswer: reference, calls };
  } catch (e) {
    return { verified: false, strategy: original, derivedAnswer: '', issue: `검산 호출 실패: ${e instanceof Error ? e.message : String(e)}`, calls };
  }
}
