// ============================================================================
// 해설 생성 PIN — 클라이언트 헬퍼 (2026-08-28)
// 관리자(ADMIN·ORG_ADMIN·super_admin)는 프롬프트 없이 통과.
// 강사는 관리자 PIN 입력 → 서버 검증 → 세션 동안 캐시(sessionStorage).
// 서버가 요청마다 x-solution-pin 을 재검증하므로 캐시는 UX 편의일 뿐이다.
// ============================================================================

const SS_KEY = 'gsaram_solution_pin';

/** fetch 헤더에 얹을 PIN (캐시돼 있으면). 관리자는 빈 객체여도 서버가 통과시킨다. */
export function solutionPinHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const pin = sessionStorage.getItem(SS_KEY);
  return pin ? { 'x-solution-pin': pin } : {};
}

export function clearSolutionPin(): void {
  if (typeof window !== 'undefined') sessionStorage.removeItem(SS_KEY);
}

/**
 * 해설 생성 전에 호출 — 통과 가능하면 true.
 * 관리자면 즉시 true. 강사면 (캐시 없을 때) PIN 프롬프트 → 서버 검증.
 * 취소하거나 검증 실패를 반복하면 false.
 */
export async function ensureSolutionPin(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/solution-pin', { cache: 'no-store' });
    if (res.ok) {
      const info = (await res.json()) as { isSet: boolean; approver: boolean };
      if (info.approver) return true;
      if (!info.isSet) {
        alert('해설 생성은 관리자 승인(PIN)이 필요합니다.\n관리자가 아직 PIN을 설정하지 않았습니다 — 관리자에게 [설정 > 해설 생성 PIN] 설정을 요청하세요.');
        return false;
      }
    }
  } catch {
    /* 조회 실패 시에도 아래 프롬프트 경로로 진행 — 서버가 최종 검증 */
  }

  if (sessionStorage.getItem(SS_KEY)) return true;

  for (let attempt = 0; attempt < 3; attempt++) {
    const pin = window.prompt('해설 생성은 관리자 승인이 필요합니다.\n관리자 PIN을 입력하세요 (숫자 4~8자리):');
    if (pin == null) return false; // 취소
    const trimmed = pin.trim();
    if (!/^\d{4,8}$/.test(trimmed)) continue;
    try {
      const v = await fetch('/api/admin/solution-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: true, pin: trimmed }),
      });
      if (v.ok) {
        sessionStorage.setItem(SS_KEY, trimmed);
        return true;
      }
      alert('PIN이 올바르지 않습니다.');
    } catch {
      alert('PIN 확인에 실패했습니다. 잠시 후 다시 시도하세요.');
      return false;
    }
  }
  return false;
}
