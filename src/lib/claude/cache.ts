// ============================================================================
// Anthropic Claude Prompt Caching 헬퍼
// ---------------------------------------------------------------------------
// 공식 문서: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
//
// 효과:
//   - 첫 호출 (cache write): 정규 입력가의 약 +25% 비용
//   - 후속 호출 (cache read): 정규 입력가의 -90% 비용
//   - 수명: 5분 idle 뒤 만료 (ephemeral). 동일 prompt 재호출이 리프레시
//
// 이 프로젝트의 사용 패턴:
//   - 자산화 배치: 수십~수백 문항 연속 처리 → 동일 시스템 프롬프트가 배치 내 반복
//   - 해설/분류/도형 해석 Claude 호출이 모두 같은 시스템 프롬프트·분류 트리 재사용
//   - 결과: 입력 토큰 전체 70~85% 절감 기대
// ============================================================================

/** Anthropic messages API가 받는 system 블록 형태 (캐싱 활성화) */
export type CachedSystemBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

/**
 * 시스템 프롬프트를 캐싱 활성화 블록으로 변환.
 * 단일 블록에 ephemeral 캐시 마커를 붙여 최대 5분간 재사용.
 *
 * @param text 시스템 프롬프트 문자열
 * @returns Anthropic messages API의 system 배열
 */
export function cachedSystem(text: string): CachedSystemBlock[] {
  return [
    {
      type: 'text',
      text,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/**
 * 큰 static 블록(분류 트리 등)을 캐싱하고, 뒤에 동적 내용을 덧붙일 때 사용.
 * 두 번째 블록은 cache_control 없음 → 매 호출마다 새 입력으로 취급.
 *
 * @example
 *   system: cachedSystemWithTail(CLASSIFICATION_TREE_PROMPT, `추가 맥락: ${context}`)
 */
export function cachedSystemWithTail(
  cachedText: string,
  dynamicTail: string
): CachedSystemBlock[] {
  return [
    { type: 'text', text: cachedText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicTail },
  ];
}

/**
 * user 메시지 content에 캐시 마커를 붙이고 싶을 때 사용.
 * 예: 긴 분류 트리를 user 메시지 prefix로 두고 뒤에 실제 문제를 붙이는 경우.
 *
 * 주의: 각 요청당 최대 4개 캐시 브레이크포인트까지만 허용됨.
 * (system 1 + user의 content block 여러 개 합쳐서 4개 이내)
 */
export type CachedUserBlock =
  | {
      type: 'text';
      text: string;
      cache_control?: { type: 'ephemeral' };
    }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
      cache_control?: { type: 'ephemeral' };
    };

/** user content 빌더 — 캐시될 prefix + 동적 content */
export function cachedUserContent(
  cachedPrefix: string,
  dynamicContent: string
): CachedUserBlock[] {
  return [
    { type: 'text', text: cachedPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicContent },
  ];
}
