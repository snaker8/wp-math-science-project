// ============================================================================
// GET /api/admin/ai-status — 이 환경에 AI 키가 걸려 있나 (관리자 전용)
// ----------------------------------------------------------------------------
// ★ 왜 필요한가 (2026-09-14): 「해설 생성이 안 된다」, 「자동매핑을 돌려도 안 바뀐다」가
//   났을 때 원인이 **키가 없어서인지** 아닌지를 볼 방법이 없었다. 서버 로그는 못 보고,
//   화면 오류 문구는 "All AI models failed" 한 줄이었다. 그래서 매번 추측으로 헤맸다.
//   운영·로컬 어느 환경에서 열든 그 환경의 상태를 그대로 보여준다.
//
// ★ 값은 절대 안 보낸다. **걸려 있나(boolean)와 앞 4글자 지문**만 — 키가 서로 다른지
//   구분할 수 있으면 충분하고, 그 이상은 유출이다.
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { isSolutionApprover } from '@/lib/security/solution-pin';

export const dynamic = 'force-dynamic';

/** 키가 서로 다른지만 구분할 수 있는 지문 — 값 자체는 드러나지 않는다 */
function fingerprint(v: string | undefined): string | null {
  if (!v) return null;
  return `${v.slice(0, 7)}…(${v.length}자)`;
}

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!isSolutionApprover(authed.data.scope)) {
    return NextResponse.json({ error: '관리자만 볼 수 있습니다' }, { status: 403 });
  }

  const anthropic = process.env.ANTHROPIC_API_KEY || '';
  const openai = process.env.OPENAI_API_KEY || '';
  const gemini = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
  const mathpix = process.env.MATHPIX_APP_KEY || '';

  return NextResponse.json({
    env: process.env.VERCEL_ENV || 'local',
    keys: {
      anthropic: { set: !!anthropic, fp: fingerprint(anthropic) },
      openai: { set: !!openai, fp: fingerprint(openai) },
      gemini: { set: !!gemini, fp: fingerprint(gemini) },
      mathpix: { set: !!mathpix, fp: fingerprint(mathpix) },
    },
    // 어느 모델을 쓰는지 — 은퇴 모델이 박혀 있으면 여기서 바로 보인다
    models: {
      classify: process.env.CLAUDE_CLASSIFY_MODEL || 'claude-sonnet-4-6',
      classifyProvider: (process.env.CLASSIFY_PROVIDER || 'anthropic').toLowerCase(),
      solutionOpusFallback: process.env.ANTHROPIC_OPUS_MODEL || 'claude-opus-4-7',
    },
    checkedAt: new Date().toISOString(),
  });
}
