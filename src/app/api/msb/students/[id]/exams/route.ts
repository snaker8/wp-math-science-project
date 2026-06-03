// ============================================================================
// GET /api/msb/students/{id}/exams
//   자사관 플래너의 모의고사 점수 동기화 — 학생 1명의 모의고사 4종 점수.
//
//   응답: { exams: [{ type, score, date, note }] }
//     - type ∈ mockFinal1(미리보는 기말 1회) / mockFinal2 / mock1(모의고사 1회) / mock2
//
//   ★ 현재: 모의고사 점수 저장 테이블이 아직 없어 빈 배열을 반환한다.
//     플래너는 exams 응답이 비거나 실패해도 진단 동기화만 정상 진행한다(수동 입력 가능).
//     점수 저장 테이블(student_exam_scores) + 입력 UI 는 후속 작업으로 별도 승인 후 추가.
//
//   인증: Authorization: Bearer <MSB_API_KEY>
// ============================================================================

import { NextRequest } from 'next/server';
import { requireMsbKey } from '@/lib/security/msb-auth';
import { corsJson, corsPreflight } from '@/lib/http/cors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest) {
  const a = requireMsbKey(req);
  if (!a.ok) return corsJson(req, { error: a.error }, a.status);

  // 모의고사 점수 저장소 미구현 → 빈 배열 (후속 작업)
  return corsJson(req, { exams: [] });
}
