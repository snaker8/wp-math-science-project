// ============================================================================
// CORS 헬퍼 — 자사관 플래너(PLAN.html, GitHub Pages) ↔ 과사람 API 연동 전용
//
//   플래너는 https://snaker8.github.io 에서 fetch 로 호출(다른 origin)하고
//   Authorization: Bearer 헤더를 동반한다.
//   → credentials 동반 요청은 'Access-Control-Allow-Origin: *' 가 금지되므로
//     반드시 origin 화이트리스트를 echo 한다.
//
//   추가 origin 은 env MSB_ALLOWED_ORIGINS (콤마 구분) 로 확장. (로컬 테스트 등)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ORIGINS = ['https://snaker8.github.io'];

function allowedOrigins(): string[] {
  const extra = (process.env.MSB_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  // 화이트리스트에 있을 때만 origin echo (없으면 헤더 미부착 → 브라우저가 차단)
  if (allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/** OPTIONS preflight 응답 */
export function corsPreflight(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** CORS 헤더가 부착된 JSON 응답 */
export function corsJson(req: NextRequest, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}
