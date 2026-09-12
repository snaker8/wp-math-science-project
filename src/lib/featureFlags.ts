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
/**
 * ★ 2026-09-12 대표 지시 「과학 일단 비활성화」.
 *   과학은 수학비서 분류 마스터가 아직 없어 출제·문제은행 화면이 안내 카드만 띄운다.
 *   환경변수를 끄는 대신 여기서 잠근다 — 배포 없이 실수로 켜지는 것도 같이 막힌다.
 *   다시 켤 때: 이 상수를 false 로 (env 는 이미 true).
 */
export const SCIENCE_TRACK_DISABLED = true;

export const TRACK_SPLIT_ENABLED =
  !SCIENCE_TRACK_DISABLED && process.env.NEXT_PUBLIC_TRACK_SPLIT_ENABLED === 'true';
