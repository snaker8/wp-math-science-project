// ============================================================================
// POST /api/problems/[problemId]/ai-variant — AI 유사문제 1건 (설계서 S5)
// ----------------------------------------------------------------------------
// 후보풀에 **같은 유형의 문제가 없을 때** 쓰는 마지막 수단. 원본의 구조는 두고 숫자·조건만 바꾼다.
//
//   ① 미리보기 (body 비움)   AI 1회 호출 → { variant, usage } — **저장하지 않는다**
//   ② 담기   (commit+variant) AI 안 부름 → problems + classifications 저장 → { id }
//
// ★ 비용 규율 (대표 반복 지시): **버튼 한 번에 한 건.** 배열도, 배치도, 자동 재시도도 없다.
//   분류 전체도 비용 때문에 천천히 돌리는 중이다 (대표, 09-14). 여기서 몰래 더 쓰면 안 된다.
// ★ 모델 claude-sonnet-5 (대표 09-14 「소넷 5가 맞다」). 수학 정확성이 걸린 자리라 Haiku 는 안 쓴다.
//   실측 1건 (2026-09-14, 원 두 개의 둘레 합 문제): 입력 863 · 출력 1,522(**생각 1,153**) · 13초 ≈ 35원.
//   ★ 토큰 수로 추산한 19원의 두 배다 — 생각 토큰이 출력의 4분의 3이다. 화면에 35원으로 적는다.
//   생각을 끄면 싸지지만 이 자리는 **답을 직접 풀어 맞히는** 게 전부라 끄지 않는다.
// ★ 도형·그림이 붙은 문제는 **거절한다.** 숫자를 바꾸면 그림과 어긋나는데 그림은 못 고친다.
//   조용히 틀린 문제를 만드느니 안 만드는 게 낫다.
// ★ 미리보기를 저장 안 하는 이유 — 교사가 보고 버린 변형까지 문제은행에 쌓이면 은행이 썩는다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess, resolveInsertInstituteId } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MODEL = 'claude-sonnet-5';

export interface AiVariant {
  content: string;
  choices: string[];
  answer: string;
  solution: string;
  /** 무엇을 바꿨는지 한 줄 — 교사가 원본과 대조할 수 있게 */
  changed: string;
}

const SYSTEM = `당신은 한국 중·고등학교 수학 문제를 만드는 출제 전문가입니다.
원본 문제의 **구조와 묻는 것은 그대로 두고, 숫자와 조건만 바꾼** 유사 문제 하나를 만듭니다.

반드시 지킬 것:
- 풀이 방법·난이도·문장 형식을 원본과 같게 유지한다. 새로운 개념을 끌어들이지 않는다.
- 바꾼 숫자로 **직접 끝까지 풀어** 정답을 구한다. 풀이의 마지막 값과 answer 가 다르면 안 된다.
- 답이 지저분해지면(무리수·분수가 원본보다 훨씬 복잡해지면) 숫자를 다시 골라 깔끔하게 맞춘다.
- 객관식이면 보기 5개를 ①②③④⑤ 로 쓰고, 오답 보기도 그럴듯한 계산 실수 결과로 만든다.
  answer 는 정답 보기의 번호(①~⑤ 중 하나)만 쓴다.
- 주관식이면 choices 는 빈 배열, answer 는 최종 값만 쓴다.
- 수식은 KaTeX 로 렌더한다: **본문과 풀이 양쪽 모두** 수식을 $...$ 로 감싸고, \\displaystyle 은 쓰지 않는다.
- 그림·그래프·표를 새로 만들지 않는다. 원본에 없던 「그림과 같이」 같은 표현을 쓰지 않는다.

출력은 JSON 하나만. 설명·마크다운·코드펜스 없이:
{"content":"문제 본문","choices":["① …","② …","③ …","④ …","⑤ …"],"answer":"③","solution":"풀이 과정 전체","changed":"무엇을 바꿨는지 한 줄"}`;

/** 그림이 붙은 문제인가 — 숫자를 바꾸면 그림과 어긋난다 */
function hasFigure(content: string): boolean {
  return /<img|!\[|data:image|\[figure|\\includegraphics/i.test(content);
}

function firstJsonObject(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

interface BaseProblem {
  id: string;
  institute_id: string | null;
  content_latex: string | null;
  solution_latex: string | null;
  answer_json: Record<string, unknown> | null;
  subject_track: string | null;
  source_name: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ problemId: string }> }) {
  const { problemId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope, user } = authed.data;

  let body: { commit?: unknown; variant?: unknown } = {};
  try { body = await req.json(); } catch { /* 빈 body = 미리보기 */ }

  // ── 원본 ──────────────────────────────────────────────────────────
  const { data: baseRow } = await sb
    .from('problems')
    .select('id, institute_id, content_latex, solution_latex, answer_json, subject_track, source_name')
    .eq('id', problemId).is('deleted_at', null).maybeSingle();
  const base = baseRow as BaseProblem | null;
  if (!base) return NextResponse.json({ error: '원본 문제를 찾을 수 없습니다' }, { status: 404 });
  // 공통 풀(institute_id null)은 모두 볼 수 있다 — 격리된 것만 막는다
  if (base.institute_id) {
    try { assertInstituteAccess(scope, base.institute_id); }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  }

  const { data: clsRow } = await sb
    .from('classifications')
    .select('type_code, difficulty, cognitive_domain')
    .eq('problem_id', problemId).maybeSingle();
  const cls = clsRow as { type_code: string; difficulty: string; cognitive_domain: string } | null;

  // ── ② 담기 — AI 안 부른다 ──────────────────────────────────────────
  if (body.commit === true) {
    const v = body.variant as Partial<AiVariant> | undefined;
    if (!v?.content || typeof v.content !== 'string') {
      return NextResponse.json({ error: '저장할 변형 내용이 없습니다' }, { status: 400 });
    }
    const choices = Array.isArray(v.choices) ? v.choices.filter((c) => typeof c === 'string') : [];
    const answerJson = {
      type: choices.length > 0 ? 'multiple_choice' : 'short_answer',
      choices,
      correct_answer: String(v.answer ?? ''),
      finalAnswer: String(v.answer ?? ''),
      ai_variant: true,
    };
    const instituteId = resolveInsertInstituteId(scope, null);   // ★ 공통 풀에 안 넣는다 — 만든 학원 것
    const { data: ins, error: insErr } = await sb
      .from('problems')
      .insert({
        institute_id: instituteId,
        created_by: user.id,
        content_latex: v.content,
        solution_latex: typeof v.solution === 'string' ? v.solution : null,
        answer_json: answerJson,
        status: 'PENDING_REVIEW',
        source_name: 'AI 변형',
        source_label: base.source_name ? `${base.source_name} 변형` : 'AI 변형',
        subject_track: base.subject_track || 'math',
        ai_analysis: {
          origin: 'ai-variant',
          baseProblemId: problemId,
          model: MODEL,
          changed: typeof v.changed === 'string' ? v.changed : '',
          generatedAt: new Date().toISOString(),
        },
      })
      .select('id')
      .single();
    if (insErr || !ins) {
      return NextResponse.json({ error: `저장 실패: ${insErr?.message ?? '알 수 없음'}` }, { status: 500 });
    }
    const newId = (ins as { id: string }).id;

    // 분류는 원본 것을 그대로 물려준다 — 같은 유형·같은 난이도가 이 기능의 전제다
    if (cls?.type_code) {
      await sb.from('classifications').insert({
        problem_id: newId,
        type_code: cls.type_code,
        difficulty: cls.difficulty,
        cognitive_domain: cls.cognitive_domain,
        classification_source: 'AI_VARIANT_INHERIT',
        is_verified: false,
      });
    }
    return NextResponse.json({ id: newId, typeCode: cls?.type_code ?? null, difficulty: cls?.difficulty ?? null });
  }

  // ── ① 미리보기 — AI 1회 ────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI 키가 설정되지 않았습니다' }, { status: 503 });
  const content = base.content_latex ?? '';
  if (content.trim().length < 5) return NextResponse.json({ error: '원본 본문이 비어 변형할 수 없습니다' }, { status: 400 });
  if (hasFigure(content)) {
    return NextResponse.json({
      error: '그림이 있는 문제는 변형하지 않습니다. 숫자를 바꾸면 그림과 어긋나는데 그림은 못 고칩니다.',
    }, { status: 422 });
  }

  const aj = (base.answer_json ?? {}) as { choices?: unknown; correct_answer?: unknown };
  const baseChoices = Array.isArray(aj.choices) ? aj.choices.filter((c): c is string => typeof c === 'string') : [];
  const userMsg = [
    `원본 문제:\n${content}`,
    baseChoices.length > 0 ? `원본 보기:\n${baseChoices.join('\n')}` : '(주관식 — 보기 없음)',
    base.solution_latex && base.solution_latex.trim().length > 10
      ? `원본 풀이:\n${base.solution_latex}`
      : '(원본 풀이가 없습니다. 변형된 문제를 처음부터 직접 풀어 정답을 구하세요.)',
    aj.correct_answer ? `원본 정답: ${String(aj.correct_answer)}` : '',
    cls?.difficulty ? `난이도: ${cls.difficulty} (1~10). 이 난이도를 유지하세요.` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      // ★ 생각 토큰이 max_tokens 에 들어간다 — 좁게 잡으면 본문이 0자로 끝난다 (Opus 5 실측, ai-comment 주석 참고).
      //   변형은 풀이까지 써야 해서 총평보다 넉넉히 잡는다.
      max_tokens: 6000,
      output_config: { effort: 'low' },
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
    if (res.stop_reason === 'refusal') return NextResponse.json({ error: 'AI 가 이 요청을 거절했습니다' }, { status: 502 });
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    const json = firstJsonObject(text);
    if (!json) return NextResponse.json({ error: 'AI 응답을 읽지 못했습니다 (JSON 아님)' }, { status: 502 });

    let parsed: Partial<AiVariant>;
    try { parsed = JSON.parse(json) as Partial<AiVariant>; }
    catch { return NextResponse.json({ error: 'AI 응답 JSON 이 깨졌습니다' }, { status: 502 }); }
    if (!parsed.content || String(parsed.content).trim().length < 5) {
      return NextResponse.json({ error: 'AI 가 문제 본문을 만들지 못했습니다' }, { status: 502 });
    }

    const variant: AiVariant = {
      content: String(parsed.content).trim(),
      choices: Array.isArray(parsed.choices) ? parsed.choices.map((c) => String(c)) : [],
      answer: String(parsed.answer ?? '').trim(),
      solution: String(parsed.solution ?? '').trim(),
      changed: String(parsed.changed ?? '').trim(),
    };
    // 원본이 객관식인데 보기를 못 만들었으면 반쪽이다 — 담기 전에 알린다
    const warning = baseChoices.length > 0 && variant.choices.length === 0
      ? '원본은 객관식인데 보기가 만들어지지 않았습니다. 담기 전에 확인하세요.'
      : !variant.answer
        ? '정답이 비어 있습니다. 담기 전에 확인하세요.'
        : null;

    return NextResponse.json({
      variant, warning, model: res.model,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      typeCode: cls?.type_code ?? null,
      difficulty: cls?.difficulty ?? null,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'AI 호출 한도 — 잠시 뒤 다시' }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'AI 키가 잘못되었습니다' }, { status: 503 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI 오류 ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
