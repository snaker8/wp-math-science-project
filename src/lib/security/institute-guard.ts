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
//
// 콜드스타트 정책 (2026-05-15 ~):
//   - SHARED_LIBRARY_MODE=true: 자산화된 데이터(exams/problems/book_groups)를
//     모두 institute_id NULL(본부 공통 풀)로 강제. 가맹 학원이 업로드한 데이터
//     를 플랫폼 전체가 공유. 라이브러리 빠르게 키우기 위한 초기 정책.
//   - 후일 학원별 자산 격리로 전환 시 env 만 끄면 됨.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { TRACK_SPLIT_ENABLED } from '@/lib/featureFlags';
import { DEFAULT_SUBJECT_TRACK, isSubjectTrack, type SubjectTrack } from '@/types/track';

/**
 * 자산화 공유 모드 — 초기 콜드스타트 정책.
 * true 이면 자산화 INSERT 시 institute_id = NULL 강제 (모든 가맹 학원 공유).
 * 기본값 true — 초기 단계.
 */
export function isSharedLibraryMode(): boolean {
  const raw = process.env.SHARED_LIBRARY_MODE;
  if (raw === undefined || raw === null || raw === '') return true; // 기본 ON
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'on';
}

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
  /** 사용자가 담당·학습 가능한 트랙 배열 — users.subject_tracks. flag false 면 ['math']. */
  accessibleTracks: SubjectTrack[];
  /** 현재 활성 트랙 — users.active_subject_track. flag false 면 'math'. */
  activeTrack: SubjectTrack;
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

  // 1) users 테이블에서 institute/organization/role + subject_track 조회
  const { data: userRow, error } = await adminClient
    .from('users')
    .select('institute_id, organization_id, role, subject_tracks, active_subject_track')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserAccessScope: users 조회 실패 — ${error.message}`);
  }

  const instituteId = (userRow?.institute_id as string | null) ?? null;
  const organizationId = (userRow?.organization_id as string | null) ?? null;
  const role = (userRow?.role as string | null) ?? null;

  // subject_track — flag false 면 강제 'math' 단일 (기존 운영 흐름 호환).
  // flag true 면 DB 값 사용. DB 값이 비정상이면 fallback 'math'.
  let accessibleTracks: SubjectTrack[];
  let activeTrack: SubjectTrack;
  if (TRACK_SPLIT_ENABLED) {
    const rawTracks = (userRow?.subject_tracks as unknown[] | null) ?? null;
    const filtered = Array.isArray(rawTracks) ? rawTracks.filter(isSubjectTrack) : [];
    accessibleTracks = filtered.length > 0 ? filtered : [DEFAULT_SUBJECT_TRACK];

    const rawActive = userRow?.active_subject_track as unknown;
    activeTrack = isSubjectTrack(rawActive) && accessibleTracks.includes(rawActive)
      ? rawActive
      : (accessibleTracks[0] ?? DEFAULT_SUBJECT_TRACK);
  } else {
    accessibleTracks = [DEFAULT_SUBJECT_TRACK];
    activeTrack = DEFAULT_SUBJECT_TRACK;
  }

  // 2) accessibleInstituteIds 계산
  let accessibleInstituteIds: string[] | null;

  if (isSuperAdmin) {
    // 슈퍼관리자: 모든 institute (null sentinel)
    accessibleInstituteIds = null;
  } else if (role === 'ORG_ADMIN' && organizationId) {
    // ORG_ADMIN 만: 자기 학원 산하 모든 institute (여러 센터 통합 관리)
    // ★ role 검사 필수 — 일반 강사/ADMIN 도 organization_id 가 박혀 있어,
    //   role 안 보면 자기 학원 모든 센터로 전환·접근 가능해지는 격리 누수.
    //   (TEACHER/ADMIN 은 아래 instituteId 분기로 자기 센터만)
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
    // 일반 user (TEACHER/ADMIN 등): 자기 institute 만
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
    accessibleTracks,
    activeTrack,
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
  // ★ NULL institute_id (공통 풀) — 모든 로그인 사용자 R/W 허용 (2026-05-27 사고 fix):
  //   사용자 정책 = "원래 자산화한 문제는 모두 보이게 + 수정 가능. 엄궁차수학만 격리".
  //   엄궁차수학 등 isolated organization 의 institute_id 박힌 exam 만 격리 분기 진입.
  //   직전 fix (14e709b) 가 /api/exams/[examId] GET 만 적용 → 14곳 (auto-fix 포함) 모두 일관.
  //   사용자 보고: "자동매핑 실패 HTTP 403" 해소.
  const examInstituteId = (exam as { institute_id: string | null }).institute_id;
  if (examInstituteId === null) {
    return { ok: true };
  }
  try {
    assertInstituteAccess(scope, examInstituteId);
    return { ok: true };
  } catch {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
}

export interface AssertAccessOptions {
  /**
   * true 면 쓰기 작업으로 처리 — 공통 풀(institute_id IS NULL) 자료는
   * super_admin 만 통과. 외부팀(ORG_ADMIN)이 공통 문제풀 수정·삭제하는
   * 사고 방지. (2026-05-17 보안 강화)
   */
  requireWrite?: boolean;
}

/**
 * problem 의 institute 가 scope 안에 있는지 한 번에 검증.
 *
 * 읽기 (requireWrite: false, 기본):
 *   - 공통 풀 (institute_id IS NULL) → 모두 접근 가능
 *   - 격리 자료 → scope 안에 있는지 검증
 *
 * 쓰기 (requireWrite: true):
 *   - 공통 풀 → super_admin 만 통과 (외부 ORG_ADMIN 차단)
 *   - 격리 자료 → scope 안에 있는지 검증
 *
 * @example
 *   // 읽기
 *   const guard = await assertProblemAccess(supabaseAdmin, problemId, scope);
 *
 *   // 쓰기 (수정/삭제)
 *   const guard = await assertProblemAccess(supabaseAdmin, problemId, scope, { requireWrite: true });
 *   if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
 */
export async function assertProblemAccess(
  adminClient: SupabaseClient,
  problemId: string,
  scope: InstituteAccessScope,
  options: AssertAccessOptions = {}
): Promise<{ ok: true; institute_id: string | null } | { ok: false; status: number; error: string }> {
  const { data: problem, error } = await adminClient
    .from('problems')
    .select('institute_id')
    .eq('id', problemId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!problem) return { ok: false, status: 404, error: 'Problem not found' };
  const targetInstituteId = (problem as { institute_id: string | null }).institute_id;

  // 공통 풀 — 쓰기 시 super_admin 검증
  if (targetInstituteId === null) {
    if (options.requireWrite && !scope.isSuperAdmin) {
      return { ok: false, status: 403, error: 'Common pool write requires super_admin' };
    }
    return { ok: true, institute_id: null };
  }

  // 격리 검증
  try {
    assertInstituteAccess(scope, targetInstituteId);
    return { ok: true, institute_id: targetInstituteId };
  } catch {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
}

/**
 * 공통 풀 쓰기 가드 — instituteId === null 인 자료의 수정/삭제 시도 시
 * super_admin 이 아니면 throw.
 *
 * book_groups 같이 별도 fetch 후 inline 검증 시 사용.
 *
 * @example
 *   const { data: bg } = await admin.from('book_groups').select('institute_id').eq('id', id).single();
 *   assertCommonPoolWriteAccess(scope, bg.institute_id);
 */
export function assertCommonPoolWriteAccess(
  scope: InstituteAccessScope,
  instituteId: string | null
): void {
  if (instituteId === null && !scope.isSuperAdmin) {
    throw new Error('FORBIDDEN_COMMON_POOL_WRITE');
  }
}

// ============================================================================
// 6. subject_track 필터 (Phase 2 — 헬퍼만 추가, 호출처 0)
// ============================================================================

export interface ApplyTrackFilterOptions {
  /** 컬럼 이름. 기본 'subject_track'. */
  column?: string;
  /** scope.activeTrack 대신 강제로 사용할 트랙. */
  trackOverride?: SubjectTrack;
}

/**
 * 쿼리 빌더에 subject_track 필터를 적용.
 *
 * 동작:
 *   - feature flag false → 필터 없음 (현 동작 100% 유지). 호출 자체가 no-op.
 *   - flag true 인데 호출 안 함 → 모든 트랙 보임. PR-T5 에서 단계적 호출.
 *   - flag true + 호출 → activeTrack(또는 override) 으로 필터.
 *
 * @example
 *   const q = supabaseAdmin!.from('exams').select('*');
 *   const filtered = applyInstituteFilter(q, scope);
 *   const final = applyTrackFilter(filtered, scope);
 *   const { data } = await final;
 *
 * @example // 강제 트랙 (어드민 페이지 등)
 *   const filtered = applyTrackFilter(q, scope, { trackOverride: 'science' });
 */
export function applyTrackFilter<Q extends FilterableQuery<Q>>(
  query: Q,
  scope: InstituteAccessScope,
  options: ApplyTrackFilterOptions = {}
): Q {
  // flag false → 트랙 분리 미활성. 필터 안 걸음 (현 동작 유지).
  if (!TRACK_SPLIT_ENABLED) {
    return query;
  }

  const column = options.column ?? 'subject_track';
  const track = options.trackOverride ?? scope.activeTrack;

  return query.eq(column, track);
}

// ============================================================================
// 7. 격리 대상 테이블 enum (타입 안전성)
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
