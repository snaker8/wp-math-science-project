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

describe('순서 대응 폴백 — OCR 이 글자 자체를 틀리게 읽은 경우 (해운대여중 #4, 2026-10-06)', () => {
  it('"(ㄹ), (ㅂ), 다)" + Flash 가 ㉠㉡㉢ 를 봤으면 등장 순서대로 ㉠, ㉡, ㉢', () => {
    const { repairedText, repairCount } = repairCircledJamoText('지도는 세 항구 (ㄹ), (ㅂ), 다)에서 거리가 모두 같은 지점', ['㉠', '㉡', '㉢']);
    expect(repairedText).toBe('지도는 세 항구 ㉠, ㉡, ㉢에서 거리가 모두 같은 지점');
    expect(repairCount).toBe(3);
  });
  it('토큰 수와 탐지 기호 수가 다르면 건드리지 않는다 (원본 보호)', () => {
    const { repairedText, repairCount } = repairCircledJamoText('세 항구 (ㄹ), 다)에서', ['㉠', '㉡', '㉢']);
    expect(repairedText).toBe('세 항구 (ㄹ), 다)에서');
    expect(repairCount).toBe(0);
  });
  it('글자 대응이 먼저 처리되고 남은 것만 순서 대응', () => {
    const { repairedText } = repairCircledJamoText('(ㄱ) 과 (ㅂ) 중', ['㉠', '㉡']);
    expect(repairedText).toBe('㉠ 과 ㉡ 중');
  });
  it('"(가), (나)" 같은 정상 괄호 라벨은 토큰이 아니다', () => {
    const { repairedText, repairCount } = repairCircledJamoText('빈칸 (가), (나)에 알맞은 것', ['㉠', '㉡']);
    expect(repairedText).toBe('빈칸 (가), (나)에 알맞은 것');
    expect(repairCount).toBe(0);
  });
});

describe('동그라미 음절 ㉮㉯㉰ (해운대여중 #4 실제 사례)', () => {
  it('Flash 가 ㉮㉯㉰ 를 봤고 OCR 이 "(ㄹ), (ㅂ), 다)" 면 순서대로 ㉮, ㉯, ㉰', () => {
    const { repairedText, repairCount } = repairCircledJamoText('지도는 세 항구 (ㄹ), (ㅂ), 다)에서 거리가', ['㉮', '㉯', '㉰']);
    expect(repairedText).toBe('지도는 세 항구 ㉮, ㉯, ㉰에서 거리가');
    expect(repairCount).toBe(3);
  });
  it('OCR 이 "(가), (나)" 로 읽었고 Flash 가 ㉮㉯ 를 봤으면 글자 대응으로 ㉮, ㉯', () => {
    const { repairedText } = repairCircledJamoText('두 항구 (가), (나) 사이', ['㉮', '㉯']);
    expect(repairedText).toBe('두 항구 ㉮, ㉯ 사이');
  });
  it('Flash 가 자모 ㉠㉡ 만 봤으면 "(가), (나)" 는 정상 라벨로 남긴다', () => {
    const { repairedText } = repairCircledJamoText('빈칸 (가), (나)에 (ㄱ) (ㄴ)', ['㉠', '㉡']);
    expect(repairedText).toBe('빈칸 (가), (나)에 ㉠ ㉡');
  });
});
