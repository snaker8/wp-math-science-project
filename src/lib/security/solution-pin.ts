// ============================================================================
// 해설 생성 PIN 게이트 (2026-08-28, 사용자 지시 "해설 생성을 관리자 승인 후 가능하게")
// ----------------------------------------------------------------------------
// AI 해설 생성(개별 generate-solution / 일괄 batch-solutions)은 유료 API 비용이
// 발생하므로 관리자 통제 하에 둔다.
//   - ADMIN / ORG_ADMIN / super_admin: PIN 없이 통과 (승인 주체 본인)
//   - 그 외(강사 등): 요청 헤더 `x-solution-pin` 이 institutes.solution_pin_hash
//     (sha256 hex) 와 일치해야 실행
//   - PIN 미설정(NULL): 관리자 외 전면 차단 — 관리자에게 설정 안내
// ★ 기존 클라우드 localStorage PIN(gsaram_admin_pin)은 브라우저별 로컬값이라
//   통제 수단이 못 됨 — 이 게이트는 서버(DB) 검증. (혼동 주의)
// ============================================================================

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { InstituteAccessScope } from '@/lib/security/institute-guard';

export const SOLUTION_PIN_HEADER = 'x-solution-pin';

export function hashSolutionPin(pin: string): string {
  return createHash('sha256').update(pin.trim()).digest('hex');
}

/** 관리자(승인 주체) 여부 — PIN 없이 통과 */
export function isSolutionApprover(scope: InstituteAccessScope): boolean {
  return scope.isSuperAdmin || scope.role === 'ADMIN' || scope.role === 'ORG_ADMIN';
}

/**
 * 해설 생성 요청 게이트. 통과하면 null, 차단이면 NextResponse(403) 반환.
 * 사용: `const denied = await requireSolutionPin(request, scope); if (denied) return denied;`
 */
export async function requireSolutionPin(
  request: NextRequest,
  scope: InstituteAccessScope,
): Promise<NextResponse | null> {
  if (isSolutionApprover(scope)) return null;

  if (!scope.instituteId) {
    return NextResponse.json(
      { error: '소속 센터가 없어 해설 생성 권한을 확인할 수 없습니다.', code: 'PIN_NO_INSTITUTE' },
      { status: 403 },
    );
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('institutes')
    .select('solution_pin_hash')
    .eq('id', scope.instituteId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: '해설 생성 권한 확인에 실패했습니다.', code: 'PIN_LOOKUP_FAILED' },
      { status: 500 },
    );
  }

  const storedHash = (data as { solution_pin_hash: string | null } | null)?.solution_pin_hash ?? null;
  if (!storedHash) {
    return NextResponse.json(
      {
        error: '해설 생성은 관리자 승인(PIN)이 필요합니다. 관리자가 아직 PIN을 설정하지 않았습니다 — 설정 > 해설 생성 PIN 에서 설정을 요청하세요.',
        code: 'PIN_NOT_SET',
      },
      { status: 403 },
    );
  }

  const pin = request.headers.get(SOLUTION_PIN_HEADER)?.trim() || '';
  if (!pin) {
    return NextResponse.json(
      { error: '해설 생성은 관리자 PIN이 필요합니다.', code: 'PIN_REQUIRED' },
      { status: 403 },
    );
  }
  if (hashSolutionPin(pin) !== storedHash) {
    return NextResponse.json(
      { error: '관리자 PIN이 올바르지 않습니다.', code: 'PIN_INVALID' },
      { status: 403 },
    );
  }
  return null;
}
