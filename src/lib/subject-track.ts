// ============================================================================
// 과목 트랙 (수학·과학) 공통 타입·상수·헬퍼
// ----------------------------------------------------------------------------
// URL 라우팅(/math/...·/science/...)·SubjectTrackContext·카드 페이지·헤더 토글
// 모두 이 파일을 참조. 데이터는 PR #107 마이그레이션의 users.subject_tracks·
// users.active_subject_track·problems.subject_track 등에 저장됨.
//
// @/types/track 도 동일 type 을 export (legacy 호환). 새 코드는 가능하면
// @/lib/subject-track 에서 import 권장 (라벨·테마 등 부가 정보 포함).
// ============================================================================

export type SubjectTrack = 'math' | 'science';

export const SUBJECT_TRACKS: readonly SubjectTrack[] = ['math', 'science'] as const;

export const DEFAULT_SUBJECT_TRACK: SubjectTrack = 'math';

export const TRACK_LABELS: Record<SubjectTrack, string> = {
  math: '수학',
  science: '과학',
};

export const TRACK_DESCRIPTIONS: Record<SubjectTrack, string> = {
  math: '문제은행·시험지·진단 — 수학 워크스페이스',
  science: '통합과학·물리·화학·생명·지구 — 과학 워크스페이스',
};

// 헤더 배지·카드에 사용할 색상 토큰 (Tailwind 클래스 prefix 로 사용)
export const TRACK_THEME: Record<
  SubjectTrack,
  {
    badge: string; // 헤더 배지 배경 + 텍스트
    cardRing: string; // 카드 활성 시 ring
    cardBg: string; // 카드 hover 시 배경
    accent: string; // 아이콘 색
  }
> = {
  math: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    cardRing: 'ring-indigo-500',
    cardBg: 'hover:bg-indigo-500/5',
    accent: 'text-indigo-400',
  },
  science: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    cardRing: 'ring-emerald-500',
    cardBg: 'hover:bg-emerald-500/5',
    accent: 'text-emerald-400',
  },
};

export function isSubjectTrack(value: unknown): value is SubjectTrack {
  return value === 'math' || value === 'science';
}

export function normalizeTrack(
  value: unknown,
  fallback: SubjectTrack = DEFAULT_SUBJECT_TRACK
): SubjectTrack {
  return isSubjectTrack(value) ? value : fallback;
}
