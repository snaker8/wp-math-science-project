// ============================================================================
// localStorage 안전 쓰기 — 저장 실패가 기능을 죽이지 않게
// ----------------------------------------------------------------------------
// ★ 사고 (2026-09-14): 일괄 해설 생성을 누르면
//     "QuotaExceededError: Setting the value of 'batch_solution_watches' exceeded the quota"
//   가 뜨고 **해설 생성이 통째로 중단**됐다. 정작 터진 값은 몇 백 바이트짜리 감시 목록이다.
//   저장소가 이미 꽉 차 있었고, 마지막에 쓰려던 놈이 대신 터진 것이다.
//
//   범인은 `draft_{jobId}` — 분석 작업마다 문제 전체 초안을 넣고 **한 번도 안 지운다**.
//   작업이 쌓이면 5~10MB 한도를 채운다. 그 뒤로는 아무것도 저장 못 한다.
//
// ★ 원칙 두 가지
//   ① 저장 실패는 **절대 위로 안 던진다.** 화면 편의 기능이 본 작업을 죽이면 안 된다.
//   ② 한도가 차면 **스스로 치운다.** 초안·페이지 순서 같은 캐시성 키를 **큰 것부터** 버리고
//      다시 시도한다. (사용자가 개발자도구로 지우게 만들면 안 된다)
//      ★ 날짜가 안 박힌 값이 많아 "오래된 것"은 고를 수 없다. 그래서 크기 기준이다 —
//        어차피 본 데이터는 서버에 있고 이건 화면 편의용 사본이다.
// ============================================================================

/** 지워도 되는 캐시성 키 — 오래된 것부터 버린다 (본 데이터는 서버에 있다) */
const EVICTABLE_PREFIXES = ['draft_', 'analyze-page-order-'];

function lsKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) out.push(k);
  }
  return out;
}

/** 지워도 되는 키를 큰 것부터 골라 버린다. 지운 개수를 돌려준다. */
function evict(limit = 8): number {
  const cands = lsKeys()
    .filter((k) => EVICTABLE_PREFIXES.some((p) => k.startsWith(p)))
    .map((k) => ({ k, size: (localStorage.getItem(k) || '').length }))
    .sort((a, b) => b.size - a.size)
    .slice(0, limit);
  for (const c of cands) {
    try { localStorage.removeItem(c.k); } catch { /* 지우는 것도 실패하면 손 뗀다 */ }
  }
  return cands.length;
}

/**
 * 저장한다. 실패해도 **던지지 않는다**.
 * 한도 초과면 오래된 캐시를 버리고 한 번 더 해 본다.
 * @returns 저장에 성공했나
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // 한도 초과로 보고 청소 후 재시도
    try {
      if (evict() > 0) {
        localStorage.setItem(key, value);
        return true;
      }
    } catch { /* 그래도 안 되면 포기 — 화면은 계속 돈다 */ }
    try {
      // 마지막 수단: 이 키의 옛 값이라도 비워 자리 확보
      localStorage.removeItem(key);
      localStorage.setItem(key, value);
      return true;
    } catch {
      console.warn(`[safe-storage] 저장 실패(무시하고 진행): ${key}`);
      return false;
    }
  }
}
