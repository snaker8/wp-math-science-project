// ============================================================================
// POST /api/classes/[classId]/students/[studentId]/ai-comment — 학부모 리포트 「선생님 총평」 AI 초안
// ----------------------------------------------------------------------------
// 매쓰홀릭 학생 화면 `genai/generate-ai-comment` 대응 (09 §5-2). 대표 승인 2026-09-06 「go」.
//   · 교사가 「AI 초안」 버튼을 누를 때만 호출한다 — 자동 반복 없음. (API 비용 규율)
//   · 재료: 최근 N일 학습 이력(종류·점수·교사 코멘트) + 코스 진행도. 문제 본문은 안 보낸다.
//   · 모델 claude-opus-5 (대표 미지정 → 기본), effort low. 실측 1건 388 입력 · 282 출력 ≈ 12원.
//   · 결과는 저장하지 않는다 — 교사가 고쳐서 리포트 링크에 총평(note)으로 넣는다.
// body { days?: 1|7|30 }  →  { draft, usage: { input, output }, model }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName } from '@/lib/class/class-students';
import { buildStudentHistory } from '@/lib/class/student-history';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RouteParams { params: Promise<{ classId: string; studentId: string }> }
const MODEL = 'claude-opus-5';

const SYSTEM = `당신은 수학 학원 선생님을 돕는 보조입니다. 학부모에게 보내는 학습 리포트의 「선생님 총평」 초안을 씁니다.
규칙:
- 한국어 존댓말, 3~4문장, 300자 이내. 학생 이름으로 시작.
- 주어진 학습 기록(종류·문항·정답률·기존 코멘트)에서 근거가 있는 말만 한다. 없는 사실을 지어내지 않는다.
- 잘한 점 하나 → 보완할 점 하나 → 다음 주 방향 한 문장. 과장·상투적 격려("최고예요")는 피한다.
- 정답률 수치는 그대로 인용해도 좋다. 학습 기록이 없으면 "이번 기간 채점된 학습이 없습니다"로 시작하고 다음 계획만 제안한다.
- 출력은 총평 본문만. 제목·인사말·따옴표·마크다운 없이.`;

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI 키가 설정되지 않았습니다' }, { status: 503 });
  const sb = supabaseAdmin;

  const { data: cls } = await sb.from('classes').select('id, name, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  const c = cls as { id: string; name: string; institute_id: string | null };
  try { assertInstituteAccess(authed.data.scope, c.institute_id); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const roster = await resolveClassStudents(sb, classId);
  if (!roster.studentIds.includes(studentId)) return NextResponse.json({ error: '이 반 학생이 아닙니다' }, { status: 404 });

  let body: { days?: unknown } = {};
  try { body = await req.json(); } catch { /* 빈 body 허용 */ }
  const days = [1, 7, 30].includes(Number(body.days)) ? Number(body.days) : 7;

  const refs = roster.refsByStudent.get(studentId) ?? [studentId];
  const name = displayName(roster.userById.get(studentId));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { items, summary } = await buildStudentHistory(sb, classId, refs, { since, limit: 60 });

  const lines = items.slice(0, 40).map((it) =>
    `- ${it.at.slice(0, 10)} ${it.kindLabel}${it.sub ? `(${it.sub})` : ''} 「${it.title.slice(0, 40)}」 ${it.correct}/${it.graded}문항${it.pct != null ? ` (${it.pct}%)` : ''}${it.comment ? ` · 코멘트: ${it.comment.slice(0, 80)}` : ''}`
  );
  const user = [
    `학생: ${name} · 반: ${c.name} · 기간: 최근 ${days}일`,
    `요약: 학습 ${summary.sessions}회 · 정답률 ${summary.pct == null ? '—' : `${summary.pct}%`} (${summary.correct}/${summary.graded}문항) · 코스 진행도 ${summary.stepsTotal > 0 ? `${summary.stepsDone}/${summary.stepsTotal}회차` : '코스 없음'}`,
    '학습 기록:',
    ...(lines.length ? lines : ['(이 기간 채점된 학습 없음)']),
  ].join('\n');

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      // ★ Opus 5 는 기본으로 생각(thinking)을 하고 그 토큰이 max_tokens 에 들어간다 — 600 이면 본문이 0자로 끝났다(실측).
      //   effort low + 넉넉한 max_tokens. 실측 388 입력 · 282 출력 · 7초.
      max_tokens: 4000,
      output_config: { effort: 'low' },
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') return NextResponse.json({ error: 'AI 가 이 요청을 거절했습니다' }, { status: 502 });
    const draft = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    if (!draft) return NextResponse.json({ error: 'AI 응답이 비었습니다' }, { status: 502 });
    return NextResponse.json({
      draft, model: res.model,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'AI 호출 한도 — 잠시 뒤 다시' }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'AI 키가 잘못되었습니다' }, { status: 503 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI 오류 ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
