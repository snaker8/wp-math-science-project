// ============================================================================
// Institute Guard — Multi-Tenancy 격리 헬퍼
//
// 목적: supabaseAdmin (service_role, RLS 우회) 사용 시 앱 레벨에서 institute_id
//      필터링을 일관되게 적용하기 위한 중앙화 모듈.
//
// 사용 시나리오:
//   1. API route 진입 시 사용자 scope 결정 → getUserAccessScope()
//   2. 쿼리 빌더에 격리 필터 자동 적용 → applyInstituteFilter()
//   3. 특정 institute_id 접근 가드 → assertInstituteAccess()
//
// 권한 계층:
//   - super_admin (auth.users.app_metadata.super_admin = true): 모든 institute 접근
//   - ORG_ADMIN (users.role = 'ORG_ADMIN' + organization_id): 자기 학원 산하 모든 institute
//   - 일반 user (ADMIN/TEACHER/STUDENT): 자기 institute_id 만
//
// 공통 풀 처리:
//   - problems, book_groups: institute_id IS NULL = 공통 풀, 모두 접근 가능
//   - applyInstituteFilter({ allowCommonPool: true }) 옵션으로 처리
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Query builder 의 격리 필터링에 필요한 메서드만 추상화.
 * Supabase PostgrestFilterBuilder 의 generic 이 매우 복잡해서 helper 에서
 * 정확한 타입 보존은 비현실적 — chain 가능한 메서드 시그니처만 보존.
 */
type FilterableQuery<Self> = {
  eq(column: string, value: unknown): Self;
  in(column: string, values: readonly unknown[]): Self;
  is(column: string, value: null | boolean): Self;
  or(filters: string): Self;
};

/** 격리 권한 정보 — 한 사용자에 대해 한 번 계산해서 재사용 */
export interface InstituteAccessScope {
  /** 사용자 UUID (auth.uid()) */
  userId: string;
  /** 자기 institute. NULL 가능 (배정 안 된 신규 사용자) */
  instituteId: string | null;
  /** ORG_ADMIN 의 학원 ID. 일반 user 는 NULL */
  organizationId: string | null;
  /** users.role 값 — 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT' | 'ORG_ADMIN' */
  role: string | null;
  /** 시스템 슈퍼관리자 여부 — auth.users.app_metadata.super_admin = true */
  isSuperAdmin: boolean;
  /** 캐시: 이 scope 로 접근 가능한 institute_id 목록 (super_admin 인 경우 null = 모두) */
  accessibleInstituteIds: string[] | null;
}

export interface ApplyInstituteFilterOptions {
  /** 컬럼 이름. 기본 'institute_id'. */
  column?: string;
  /** true 면 institute_id IS NULL 도 허용 (공통 풀 패턴 — problems, book_groups). 기본 false. */
  allowCommonPool?: boolean;
}

// ============================================================================
// 1. 사용자 scope 가져오기
// ============================================================================

/**
 * 사용자의 격리 권한 정보를 한 번 계산. 한 request 안에서 결과를 재사용 권장.
 *
 * @param adminClient supabaseAdmin (service_role) — RLS 우회로 user 정보 조회
 * @param userId auth.uid() 결과
 * @param appMetadata auth user 의 app_metadata (super_admin 판정용). 호출자가 user.app_metadata 전달.
 * @returns InstituteAccessScope
 *
 * @example
 *   const sb = await createSupabaseServerClient();
 *   const { data: { user } } = await sb!.auth.getUser();
 *   if (!user) return new Response('unauthorized', { status: 401 });
 *   const scope = await getUserAccessScope(supabaseAdmin!, user.id, user.app_metadata);
 */
export async function getUserAccessScope(
  adminClient: SupabaseClient,
  userId: string,
  appMetadata?: Record<string, unknown> | null
): Promise<InstituteAccessScope> {
  const isSuperAdmin = Boolean(appMetadata?.super_admin === true);

  // 1) users 테이블에서 institute/organization/role 조회
  const { data: userRow, error } = await adminClient
    .from('users')
    .select('institute_id, organization_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserAccessScope: users 조회 실패 — ${error.message}`);
  }

  const instituteId = (userRow?.institute_id as string | null) ?? null;
  const organizationId = (userRow?.organization_id as string | null) ?? null;
  const role = (userRow?.role as string | null) ?? null;

  // 2) accessibleInstituteIds 계산
  let accessibleInstituteIds: string[] | null;

  if (isSuperAdmin) {
    // 슈퍼관리자: 모든 institute (null sentinel)
    accessibleInstituteIds = null;
  } else if (organizationId) {
    // ORG_ADMIN: 자기 학원 산하 모든 institute
    const { data: instRows, error: instErr } = await adminClient
      .from('institutes')
      .select('id')
      .eq('organization_id', organizationId);
    if (instErr) {
      throw new Error(`getUserAccessScope: institutes 조회 실패 — ${instErr.message}`);
    }
    const ids = ((instRows ?? []) as { id: string }[]).map((r) => r.id);
    // 자기 institute 도 포함 (있으면)
    if (instituteId && !ids.includes(instituteId)) {
      ids.push(instituteId);
    }
    accessibleInstituteIds = ids;
  } else if (instituteId) {
    // 일반 user: 자기 institute 만
    accessibleInstituteIds = [instituteId];
  } else {
    // 배정 안 된 신규 user: 접근 가능한 institute 0
    accessibleInstituteIds = [];
  }

  return {
    userId,
    instituteId,
    organizationId,
    role,
    isSuperAdmin,
    accessibleInstituteIds,
  };
}

// ============================================================================
// 2. 쿼리에 격리 필터 적용
// ============================================================================

/**
 * 쿼리 빌더에 institute_id 격리 필터를 자동 적용.
 *
 * super_admin → 필터 없음 (모두 접근).
 * ORG_ADMIN → .in('institute_id', [...]) 적용.
 * 일반 user → .eq('institute_id', myId).
 * 공통 풀 옵션 → .or('institute_id.is.null,institute_id.in.(...)')
 *
 * @example
 *   const q = supabaseAdmin!.from('exams').select('*');
 *   const filtered = applyInstituteFilter(q, scope);
 *   const { data } = await filtered;
 *
 * @example // 공통 풀 허용 (problems)
 *   const q = supabaseAdmin!.from('problems').select('*');
 *   const filtered = applyInstituteFilter(q, scope, { allowCommonPool: true });
 */
export function applyInstituteFilter<Q extends FilterableQuery<Q>>(
  query: Q,
  scope: InstituteAccessScope,
  options: ApplyInstituteFilterOptions = {}
): Q {
  const column = options.column ?? 'institute_id';
  const allowCommonPool = options.allowCommonPool ?? false;

  // (a) super_admin: 필터 없음 (공통 풀이든 아니든 모두 보임)
  if (scope.isSuperAdmin) {
    return query;
  }

  // (b) accessibleInstituteIds 가 null 인 경우는 super_admin 뿐 — 위에서 처리됨
  const ids = scope.accessibleInstituteIds ?? [];

  if (ids.length === 0) {
    if (allowCommonPool) {
      // 공통 풀만 보임
      return query.is(column, null);
    }
    // 접근 가능한 institute 가 없음 + 공통 풀 X → 결과 0건 강제
    return query.eq(column, '00000000-0000-0000-0000-000000000000');
  }

  if (ids.length === 1 && !allowCommonPool) {
    return query.eq(column, ids[0]);
  }

  if (allowCommonPool) {
    // 공통 풀(NULL) + 자기 institute 들
    const inClause = ids.map((id) => `${column}.eq.${id}`).join(',');
    return query.or(`${column}.is.null,${inClause}`);
  }

  // ORG_ADMIN: 여러 institute_id IN
  return query.in(column, ids);
}

// ============================================================================
// 3. 특정 institute_id 접근 가드
// ============================================================================

/**
 * 사용자가 target_institute_id 에 접근 권한이 있는지 검증.
 * 위반 시 throw — API route 에서 잡아서 403 응답하면 됨.
 *
 * @example
 *   try {
 *     await assertInstituteAccess(scope, exam.institute_id);
 *   } catch (e) {
 *     return new Response('forbidden', { status: 403 });
 *   }
 */
export function assertInstituteAccess(
  scope: InstituteAccessScope,
  targetInstituteId: string | null
): void {
  // super_admin: 항상 통과
  if (scope.isSuperAdmin) return;

  // 공통 풀 (institute_id IS NULL) — 호출자가 명시 허용 안 했으면 통과 X
  // (이 함수는 명시 institute 접근 검증용. 공통 풀은 applyInstituteFilter 로 처리.)
  if (targetInstituteId === null) {
    throw new Error('assertInstituteAccess: target institute_id is null (공통 풀 의도면 별도 처리 필요)');
  }

  const ids = scope.accessibleInstituteIds ?? [];
  if (!ids.includes(targetInstituteId)) {
    throw new Error(
      `assertInstituteAccess: forbidden — user ${scope.userId} cannot access institute ${targetInstituteId}`
    );
  }
}

// ============================================================================
// 4. 편의: scope 가 INSERT 에 사용할 institute_id 결정
// ============================================================================

/**
 * INSERT 시 institute_id 컬럼에 넣을 값 결정.
 * 일반 user 는 자기 institute, ORG_ADMIN/super_admin 은 명시 인자 우선.
 *
 * @param scope 사용자 scope
 * @param requestedInstituteId 요청에서 명시한 institute_id (예: 어드민이 다른 센터에 INSERT)
 * @returns INSERT 에 사용할 institute_id
 * @throws requested 가 scope 권한 밖이면 throw
 *
 * @example
 *   const newRow = {
 *     ...payload,
 *     institute_id: resolveInsertInstituteId(scope, payload.institute_id),
 *   };
 */
export function resolveInsertInstituteId(
  scope: InstituteAccessScope,
  requestedInstituteId?: string | null
): string {
  // 명시 요청 있음
  if (requestedInstituteId) {
    if (scope.isSuperAdmin) return requestedInstituteId;
    const ids = scope.accessibleInstituteIds ?? [];
    if (!ids.includes(requestedInstituteId)) {
      throw new Error(
        `resolveInsertInstituteId: forbidden — user ${scope.userId} cannot INSERT into institute ${requestedInstituteId}`
      );
    }
    return requestedInstituteId;
  }

  // 명시 없음 — 자기 institute 사용
  if (!scope.instituteId) {
    throw new Error(
      `resolveInsertInstituteId: user ${scope.userId} has no institute assigned and no requested institute`
    );
  }
  return scope.instituteId;
}

// ============================================================================
// 5. 편의: examId 접근 가드 (자주 쓰이는 패턴)
// ============================================================================

/**
 * exam 의 institute 가 scope 안에 있는지 한 번에 검증.
 * 라우트 핸들러에서 자주 쓰이는 패턴 (admin/exam route 등 9~10개) 통일.
 *
 * @returns { ok: true } 또는 { ok: false, status, error } — 호출자가 NextResponse 로 변환
 *
 * @example
 *   const guard = await assertExamAccess(supabaseAdmin, examId, scope);
 *   if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
 */
export async function assertExamAccess(
  adminClient: SupabaseClient,
  examId: string,
  scope: InstituteAccessScope
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: exam, error } = await adminClient
    .from('exams')
    .select('institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!exam) return { ok: false, status: 404, error: 'Exam not found' };
  try {
    assertInstituteAccess(scope, (exam as { institute_id: string | null }).institute_id);
    return { ok: true };
  } catch {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
}

// ============================================================================
// 6. 격리 대상 테이블 enum (타입 안전성)
// ============================================================================

/**
 * institute_id 격리 대상 테이블 화이트리스트.
 * 새 테이블 추가 시 여기 등록 → CI lint 가 누락 검출.
 */
export const ISOLATION_TABLES = [
  'exams',
  'problems',          // institute_id NULL = 공통 풀
  'classes',
  'class_enrollments',
  'book_groups',       // institute_id NULL = 공통 풀
  'source_files',
  'users',
  // diagnostics.* (스키마 분리. PR-5 후속 단계에서 정책 강화 시 추가)
] as const;

export type IsolationTable = (typeof ISOLATION_TABLES)[number];

/**
 * institute_id NULL 을 공통 풀로 허용하는 테이블.
 */
export const COMMON_POOL_TABLES: ReadonlySet<IsolationTable> = new Set([
  'problems',
  'book_groups',
]);
