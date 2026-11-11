// ============================================================================
// 교재 자료실 — 누가 어느 학교급 교재를 받을 수 있나 (판단은 이 파일 한 곳)
// ============================================================================
//
// - 관리자(플랫폼 super_admin 또는 역할 ADMIN)는 언제나 전부. 권한 화면도 관리자만.
// - 그 밖의 사람은 textbook_access 한 줄로 정한다: 중등/고등 체크 + 만료일(그날까지 포함, 한국 날짜).
// - 줄이 없거나 만료됐으면 아무것도 못 받는다.

export const TEXTBOOK_LEVELS = ['중등', '고등'] as const;
export type TextbookLevel = (typeof TEXTBOOK_LEVELS)[number];

export type TextbookAccessRow = {
  can_middle: boolean;
  can_high: boolean;
  expires_at: string | null; // 'YYYY-MM-DD'
};

/** 관리자 판정 — 권한을 줄 수 있고, 모든 교재를 받을 수 있다. */
export function isTextbookManager(role: string | null | undefined, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || role === 'ADMIN';
}

/** 한국 시각 기준 오늘 'YYYY-MM-DD'. */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 만료일이 지났나 — 만료일 당일까지는 쓸 수 있다. */
export function isExpired(expiresAt: string | null, today: string): boolean {
  return !!expiresAt && expiresAt < today;
}

/** 이 사람이 받을 수 있는 학교급. */
export function allowedLevels(
  opts: { manager: boolean; access: TextbookAccessRow | null; now?: Date },
): TextbookLevel[] {
  if (opts.manager) return [...TEXTBOOK_LEVELS];
  const a = opts.access;
  if (!a || isExpired(a.expires_at, todayKst(opts.now))) return [];
  const out: TextbookLevel[] = [];
  if (a.can_middle) out.push('중등');
  if (a.can_high) out.push('고등');
  return out;
}

/** 관리 화면에서 들어온 값 검사. 잘못되면 사람이 읽을 이유를 돌려준다. */
export function validateAccessInput(input: unknown):
  | { ok: true; value: { userId: string; canMiddle: boolean; canHigh: boolean; expiresAt: string | null } }
  | { ok: false; message: string } {
  if (!input || typeof input !== 'object') return { ok: false, message: '요청 형식이 잘못됐습니다.' };
  const o = input as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof o.userId !== 'string' || !uuid.test(o.userId)) return { ok: false, message: '선생님을 찾을 수 없습니다.' };
  if (typeof o.canMiddle !== 'boolean' || typeof o.canHigh !== 'boolean') {
    return { ok: false, message: '중등·고등 값이 잘못됐습니다.' };
  }
  let expiresAt: string | null = null;
  if (o.expiresAt !== null && o.expiresAt !== undefined && o.expiresAt !== '') {
    if (typeof o.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.expiresAt)
      || Number.isNaN(Date.parse(`${o.expiresAt}T00:00:00Z`))) {
      return { ok: false, message: '만료일 형식이 잘못됐습니다.' };
    }
    expiresAt = o.expiresAt;
  }
  return { ok: true, value: { userId: o.userId, canMiddle: o.canMiddle, canHigh: o.canHigh, expiresAt } };
}
