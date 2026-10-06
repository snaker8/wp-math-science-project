import { describe, it, expect } from 'vitest';
import { repairCircledJamoText } from './symbol-detector';

// 2026-10-06 대표 캡처 — 작도 순서 보기 ㉠→㉡→㉢→㉣→㉤ 를 Mathpix 가 벗겨 낸 꼴들
const ALL = ['㉠', '㉡', '㉢', '㉣', '㉤'];

describe('repairCircledJamoText — 화살표 사슬(작도 순서)', () => {
  it('★ 맨몸 자모 사슬 `ㄱ → ㄴ → ㄷ → ㄹ → ς`', () => {
    const { repairedText } = repairCircledJamoText('ㄱ → ㄴ → ㄷ → ㄹ → ς', ALL);
    expect(repairedText).toBe('㉠ → ㉡ → ㉢ → ㉣ → ㉤');
  });
  it('★ 괄호·점 꼴 `(ㄱ. → (ㄷ. → (ㄴ. → (ㅁ. → (ㄹ.`', () => {
    const { repairedText } = repairCircledJamoText('(ㄱ. → (ㄷ. → (ㄴ. → (ㅁ. → (ㄹ.', ALL);
    expect(repairedText).toBe('㉠ → ㉢ → ㉡ → ㉤ → ㉣');
  });
  it('섞인 꼴 `ㄷ → ⑦ → ⑧ → ㄴ → ς` — 자모·ς 만 바꾸고 ⑦⑧ 은 손대지 않는다(어느 기호인지 모름)', () => {
    const { repairedText } = repairCircledJamoText('ㄷ → ⑦ → ⑧ → ㄴ → ς', ALL);
    expect(repairedText).toBe('㉢ → ⑦ → ⑧ → ㉡ → ㉤');
  });
  it('화살표 없는 줄의 보기 라벨 `ㄱ. 삼각형`·`ㄱ, ㄴ` 은 그대로 (원본 보호)', () => {
    expect(repairCircledJamoText('ㄱ. 삼각형은 합동이다', ALL).repairedText).toBe('ㄱ. 삼각형은 합동이다');
    expect(repairCircledJamoText('옳은 것은 ㄱ, ㄴ 이다', ALL).repairedText).toBe('옳은 것은 ㄱ, ㄴ 이다');
  });
  it('Flash 가 못 본 기호는 사슬 안이어도 안 바꾼다', () => {
    expect(repairCircledJamoText('ㄱ → ㄴ', ['㉠']).repairedText).toBe('㉠ → ㄴ');
  });
});
