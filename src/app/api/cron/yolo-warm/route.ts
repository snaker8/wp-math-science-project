// ============================================================================
// GET /api/cron/yolo-warm — YOLO 서버(HF Spaces) keep-warm 핑
//
// HF Spaces 무료 티어는 미사용 시 자동 sleep → 자산화 첫 요청이 콜드스타트로
// 실패/지연. 외부 스케줄러(GitHub Actions / Vercel Cron)가 주기적으로 이 라우트를
// 호출하면 YOLO /health 를 찔러 항상 깨어 있게 유지.
//
// 부작용 없음(단순 health 핑) — 인증 불필요. YOLO_SERVER_URL 은 Vercel env 단일 소스.
// ============================================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // HF 콜드스타트 최대 ~2분 대비

const YOLO_SERVER_URL = process.env.YOLO_SERVER_URL || '';

export async function GET() {
  const started = Date.now();

  if (!YOLO_SERVER_URL || YOLO_SERVER_URL.includes('localhost')) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: 'YOLO_SERVER_URL 미설정(프로덕션 전용)',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110_000);
  try {
    const res = await fetch(`${YOLO_SERVER_URL}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      warmedAt: new Date().toISOString(),
    });
  } catch (e) {
    clearTimeout(timer);
    // 콜드스타트 중 타임아웃이어도 깨우는 트리거는 이미 보냈으므로 200 으로 보고
    return NextResponse.json({
      ok: false,
      triggered: true,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - started,
    });
  }
}
