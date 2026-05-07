// ============================================================================
// SubjectTrack — 과목 트랙 타입
//
// 'math': 수학 트랙 (기본). 기존 운영 흐름 100% 호환.
// 'science': 과학 트랙. PR-T2~T7 단계로 점진 활성.
//
// DB 매핑:
//   - users.subject_tracks: SubjectTrack[]
//   - users.active_subject_track: SubjectTrack
//   - problems.subject_track / exams.subject_track / book_groups.subject_track / source_files.subject_track: SubjectTrack
// ============================================================================

export type SubjectTrack = 'math' | 'science';

export const SUBJECT_TRACKS: readonly SubjectTrack[] = ['math', 'science'] as const;

export function isSubjectTrack(value: unknown): value is SubjectTrack {
  return value === 'math' || value === 'science';
}

export const DEFAULT_SUBJECT_TRACK: SubjectTrack = 'math';
