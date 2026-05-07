// ============================================================================
// Feature Flags
//
// 운영 동작 분기용 플래그. NEXT_PUBLIC_* 접두는 클라이언트 번들에 노출됨.
// ============================================================================

/**
 * 수학·과학 트랙 분리 기능 활성화 여부.
 *
 * - false (기본): 모든 사용자 'math' 단일 트랙. 기존 운영 흐름 그대로.
 * - true: SubjectTrackContext / /select-track / 페이지별 트랙 필터 활성.
 *
 * Phase 2 (PR-T2) ~ Phase 6 (PR-T6) 까지는 false 유지. Phase 7 (PR-T7) 에서
 * 운영 검증 후 true 로 전환.
 */
export const TRACK_SPLIT_ENABLED =
  process.env.NEXT_PUBLIC_TRACK_SPLIT_ENABLED === 'true';
