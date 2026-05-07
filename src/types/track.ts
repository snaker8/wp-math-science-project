// ============================================================================
// SubjectTrack — 과목 트랙 타입 (legacy 호환 re-export)
//
// 본 정의는 @/lib/subject-track 으로 이전됨 (라벨·테마 등 부가 정보 포함).
// 기존 import 경로 유지를 위해 type·상수만 re-export.
// 새 코드는 가능하면 @/lib/subject-track 에서 직접 import 권장.
// ============================================================================

export {
  type SubjectTrack,
  SUBJECT_TRACKS,
  DEFAULT_SUBJECT_TRACK,
  isSubjectTrack,
} from '@/lib/subject-track';
